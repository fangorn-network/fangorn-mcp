#!/usr/bin/env node

/**
 * Fangorn MCP Server
 *
 * An MCP server that exposes the Fangorn subgraph to agents.
 * Supports two transports controlled by the TRANSPORT env var:
 *   - "stdio"  (default) — for local integrations (Claude Desktop, CLI tools)
 *   - "http"   — Streamable HTTP + legacy SSE for remote / networked clients
 */

import { config } from "dotenv";

config({ quiet: true });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";

import { SubgraphClient } from "./subgraph-client.js";
import { registerTools } from "./tools.js";

// ── Configuration ───────────────────────────────────────────────────────────

const SUBGRAPH_URL = process.env.SUBGRAPH_URL;
if (!SUBGRAPH_URL) {
  console.error("Error: SUBGRAPH_URL environment variable is required.");
  process.exit(1);
}

const TRANSPORT = (process.env.TRANSPORT ?? "stdio").toLowerCase();
const PORT = parseInt(process.env.PORT ?? "4000", 10);

const MAX_STREAMABLE_SESSIONS = parseInt(process.env.MAX_STREAMABLE_SESSIONS ?? "100", 10);
const MAX_SSE_SESSIONS = parseInt(process.env.MAX_SSE_SESSIONS ?? "100", 10);
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS ?? "1800000", 10); // 30 min default

// ── Bootstrap ───────────────────────────────────────────────────────────────

const client = new SubgraphClient(SUBGRAPH_URL);

function createServer(): McpServer {
  const server = new McpServer({
    name: "fangorn-mcp-server",
    version: "1.0.0",
  });
  registerTools(server, client);
  return server;
}

/**
 * Safely tear down both a server and its transport.
 */
async function closeSession(server: McpServer) {
  try {
    await server.close();
  } catch { /* best effort */ }
}

// ── stdio transport ─────────────────────────────────────────────────────────

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fangorn MCP server running on stdio");
}

// ── HTTP transport (Streamable HTTP + legacy SSE) ───────────────────────────

async function startHttp() {
  const app = express();
  app.use(express.json());

  // ── Streamable HTTP sessions ──────────────────────────────────────────

  interface StreamableSession {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    lastSeen: number;
  }

  const streamableSessions = new Map<string, StreamableSession>();

  /**
   * Mutex counter for streamable session creation.
   * Tracks how many sessions are currently being created so that
   * concurrent requests cannot race past the cap check.
   */
  let streamablePendingCount = 0;

  // ── Legacy SSE sessions ───────────────────────────────────────────────

  interface SseSession {
    server: McpServer;
    transport: SSEServerTransport;
    lastSeen: number;
  }

  const sseSessions = new Map<string, SseSession>();

  // ── Session cleanup sweep ─────────────────────────────────────────────

  setInterval(() => {
    const now = Date.now();

    for (const [id, session] of streamableSessions) {
      if (now - session.lastSeen > SESSION_TIMEOUT_MS) {
        console.error(`Evicting idle streamable session ${id}`);
        streamableSessions.delete(id);
        closeSession(session.server);
      }
    }

    for (const [id, session] of sseSessions) {
      if (now - session.lastSeen > SESSION_TIMEOUT_MS) {
        console.error(`Evicting idle SSE session ${id}`);
        sseSessions.delete(id);
        closeSession(session.server);
      }
    }
  }, 60_000);

  // ── Streamable HTTP endpoints ─────────────────────────────────────────

  // POST /mcp — main Streamable HTTP RPC endpoint
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Existing session — route to its transport
      if (sessionId) {
        const session = streamableSessions.get(sessionId);
        if (session) {
          session.lastSeen = Date.now();
          await session.transport.handleRequest(req, res, req.body);
          return;
        }
        // Session ID was provided but not found — reject rather than
        // silently creating a new session.
        res.status(400).json({ error: "Unknown session ID" });
        return;
      }

      // Enforce session cap, including in-flight creations, to prevent races
      if (streamableSessions.size + streamablePendingCount >= MAX_STREAMABLE_SESSIONS) {
        res.status(503).json({
          error: "Too many active sessions. Please try again later.",
        });
        return;
      }

      // Reserve a slot synchronously before any await
      streamablePendingCount++;

      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = createServer();
        await server.connect(transport);

        // Handle the init request
        await transport.handleRequest(req, res, req.body);

        // Register the real session
        if (transport.sessionId) {
          streamableSessions.set(transport.sessionId, {
            server,
            transport,
            lastSeen: Date.now(),
          });
        }

        // Clean up on close
        let closed = false;
        transport.onclose = () => {
          if (closed) return;
          closed = true;
          if (transport.sessionId) {
            streamableSessions.delete(transport.sessionId);
          }
          closeSession(server);
        };
      } catch (err) {
        throw err;
      } finally {
        // Always release the pending slot
        streamablePendingCount--;
      }
    } catch (err) {
      console.error("Error in POST /mcp:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // GET /mcp — SSE stream for Streamable HTTP server→client notifications
  app.get("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing session ID" });
        return;
      }
      const session = streamableSessions.get(sessionId);
      if (!session) {
        res.status(400).json({ error: "Invalid session ID" });
        return;
      }
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req, res, undefined);
    } catch (err) {
      console.error("Error in GET /mcp:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // DELETE /mcp — terminate Streamable HTTP session
  app.delete("/mcp", async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing session ID" });
        return;
      }
      const session = streamableSessions.get(sessionId);
      if (!session) {
        res.status(400).json({ error: "Invalid session ID" });
        return;
      }
      // handleRequest sends the 200 and closes the transport internally,
      // which fires onclose → the guard flag handles map cleanup + server.close()
      await session.transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error in DELETE /mcp:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // ── Legacy SSE transport ──────────────────────────────────────────────

  // GET /sse — open the legacy SSE event stream
  app.get("/sse", async (req: Request, res: Response) => {
    try {
      // Enforce session cap
      if (sseSessions.size >= MAX_SSE_SESSIONS) {
        res.status(503).json({
          error: "Too many active SSE sessions. Please try again later.",
        });
        return;
      }

      console.error("Legacy SSE connection opened");

      const transport = new SSEServerTransport("/messages", res);
      const server = createServer();

      sseSessions.set(transport.sessionId, {
        server,
        transport,
        lastSeen: Date.now(),
      });

      let closed = false;
      transport.onclose = () => {
        if (closed) return;
        closed = true;
        sseSessions.delete(transport.sessionId);
        closeSession(server);
      };

      await server.connect(transport);
      await transport.start();
    } catch (err) {
      console.error("Error in GET /sse:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // POST /messages — receive JSON-RPC messages for legacy SSE sessions
  app.post("/messages", async (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId query parameter" });
        return;
      }
      const session = sseSessions.get(sessionId);
      if (!session) {
        res.status(400).json({ error: "Invalid sessionId query parameter" });
        return;
      }
      session.lastSeen = Date.now();
      await session.transport.handlePostMessage(req, res);
    } catch (err) {
      console.error("Error in POST /messages:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // ── Health check ──────────────────────────────────────────────────────

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      streamableSessions: streamableSessions.size,
      sseSessions: sseSessions.size,
    });
  });

  app.listen(PORT, () => {
    console.info(
      `Fangorn MCP server listening on http://localhost:${PORT}\n` +
      `  Streamable HTTP: POST/GET/DELETE http://localhost:${PORT}/mcp\n` +
      `  Legacy SSE: GET http://localhost:${PORT}/sse → POST http://localhost:${PORT}/messages`
    );
  });
}

// ── Entrypoint ──────────────────────────────────────────────────────────────

(async () => {
  if (TRANSPORT === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
})();