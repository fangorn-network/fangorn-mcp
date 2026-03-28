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
config();

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
const PORT = parseInt(process.env.PORT ?? "3000", 10);

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

  const streamableSessions = new Map<
    string,
    { server: McpServer; transport: StreamableHTTPServerTransport }
  >();

  // POST /mcp — main Streamable HTTP RPC endpoint
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Existing session — route to its transport
    if (sessionId && streamableSessions.has(sessionId)) {
      const session = streamableSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const server = createServer();
    await server.connect(transport);

    // Handle the init request (must pass req.body!)
    await transport.handleRequest(req, res, req.body);

    // Store the session
    if (transport.sessionId) {
      streamableSessions.set(transport.sessionId, { server, transport });
    }

    // Clean up on close
    transport.onclose = () => {
      if (transport.sessionId) {
        streamableSessions.delete(transport.sessionId);
      }
    };
  });

  // GET /mcp — SSE stream for Streamable HTTP server→client notifications
  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const session = streamableSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
  });

  // DELETE /mcp — terminate Streamable HTTP session
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const session = streamableSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
    streamableSessions.delete(sessionId);
  });

  // ── Legacy SSE transport ──────────────────────────────────────────────
  // Some clients (older protocol versions) use:
  //   GET  /sse          → opens SSE event stream, receives endpoint URL
  //   POST /messages?sessionId=...  → sends JSON-RPC messages

  const sseSessions = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >();

  // GET /sse — open the legacy SSE event stream
  app.get("/sse", async (req: Request, res: Response) => {
    console.error("Legacy SSE connection opened");

    const transport = new SSEServerTransport("/messages", res);
    const server = createServer();

    sseSessions.set(transport.sessionId, { server, transport });

    transport.onclose = () => {
      sseSessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    await transport.start();
  });

  // POST /messages — receive JSON-RPC messages for legacy SSE sessions
  app.post("/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string | undefined;
    if (!sessionId || !sseSessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing sessionId query parameter" });
      return;
    }
    const session = sseSessions.get(sessionId)!;
    await session.transport.handlePostMessage(req, res);
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
    console.error(
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