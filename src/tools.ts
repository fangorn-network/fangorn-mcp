/**
 * Registers all Fangorn subgraph tools on the McpServer instance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SubgraphClient, type FileEntry, type ManifestState, type Schema } from "./subgraph-client.js";

// ── Formatters ──────────────────────────────────────────────────────────────

function formatSchemaMarkdown(s: Schema): string {
  let md = `## ${s.name}\n`;
  md += `- **Schema ID:** \`${s.schemaId}\`\n`;
  md += `- **Owner:** \`${s.owner}\`\n\n`;
  for (const v of s.versions) {
    md += `### Version ${v.version}\n`;
    md += `- **Spec CID:** \`${v.spec_cid}\`\n`;
    if (v.agent_id) md += `- **Agent ID:** \`${v.agent_id}\`\n`;
    md += `- **Fields:**\n`;
    for (const f of v.fields) {
      md += `  - \`${f.name}\` (${f.fieldType})\n`;
    }
    md += "\n";
  }
  return md;
}

function formatFileEntryMarkdown(entry: FileEntry): string {
  let md = "";
  for (const f of entry.fields) {
    const priceInfo =
      f.price ? ` — **${f.price.price} ${f.price.currency}**` : "";
    const accessInfo = f.acc !== "plain" ? ` [${f.acc}]` : "";
    md += `- **${f.name}** (${f.atType}${accessInfo}): ${f.value}${priceInfo}\n`;
  }
  return md;
}

function formatManifestMarkdown(ms: ManifestState): string {
  let md = `### Owner: \`${ms.owner}\`\n`;
  md += `**Schema:** ${ms.schema_name}\n\n`;
  for (let i = 0; i < ms.manifest.files.length; i++) {
    md += `#### File ${i + 1}\n`;
    md += formatFileEntryMarkdown(ms.manifest.files[i]);
    md += "\n";
  }
  return md;
}

interface FangornMcpResponse {
  resultType: string;
  type: string;
  text: string;
  data: unknown;
}

interface FangornMcpError {
  resultType: string;
  err: Error
}

// ── Tool Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: SubgraphClient) {

  // ── 1. List schemas ──────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_list_schemas",
    {
      title: "List Schemas",
      description:
        "List all registered schemas in the subgraph. Optionally filter by owner address.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe("Filter schemas by owner address (e.g. 0x147c...)"),
        first: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of schemas to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of schemas to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ owner, first, skip, response_format }) => {
      try {
        const schemas = await client.listSchemas({ owner, first, skip });

        if (response_format === "markdown") {
          const md =
            schemas.length === 0
              ? "No schemas found."
              : schemas.map(formatSchemaMarkdown).join("\n---\n\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({resultType: "schemas", data: schemas}, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 2. Get schema ────────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_get_schema",
    {
      title: "Get Schema",
      description:
        "Retrieve a single schema by its fully-qualified name. Returns the schema ID, owner, and all version details including the field definitions so that agents know which fields are available for querying data.",
      inputSchema: {
        schema_name: z
          .string()
          .min(1)
          .describe("Full schema name (e.g. 'noagent-fangorn.test.music.v0')"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ schema_name, response_format }) => {
      try {
        const schema = await client.getSchema(schema_name);

        if (!schema) {
          return {
            content: [
              { type: "text", text: `Schema "${schema_name}" not found.` },
            ],
          };
        }

        if (response_format === "markdown") {
          return { content: [{ type: "text", text: formatSchemaMarkdown(schema) }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({resultType: "schema", data: schema}, null, 2)} ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 3. Query data ────────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_query_data",
    {
      title: "Query Data",
      description:
        "Query data entries from the subgraph that conform to a given schema. " +
        "Data sources publish files whose fields match the schema definition. " +
        "Encrypted fields will show 'enc' as their value with an associated price.\n\n" +
        "You can filter by a specific field name/value (e.g. field_name=\"artist\", " +
        "field_value=\"Theo Cappucino\") and/or by the data source owner address.\n\n" +
        "Tip: Use subgraph_get_schema first to discover available field names for filtering.",
      inputSchema: {
        schema_name: z
          .string()
          .min(1)
          .describe("Full schema name to query data for (e.g. 'noagent-fangorn.test.music.v0')"),
        field_name: z
          .string()
          .optional()
          .describe("Filter by a specific field name (e.g. 'artist')"),
        field_value: z
          .string()
          .optional()
          .describe("Filter by a specific field value (e.g. 'Theo Cappucino'). Requires field_name."),
        owner: z
          .string()
          .optional()
          .describe("Filter by data source owner address"),
        first: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of results to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of results to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ schema_name, field_name, field_value, owner, first, skip, response_format }) => {
      try {
        // Use the precise (fileEntry-level) query when filtering by field
        const hasFi = !!(field_name || field_value);

        if (hasFi) {
          const entries = await client.queryDataPrecise({
            schema_name,
            field_name,
            field_value,
            owner,
            first,
            skip,
          });

          if (response_format === "markdown") {
            const md =
              entries.length === 0
                ? "No matching data entries found."
                : entries.map((e, i) => `### Entry ${i + 1}\n${formatFileEntryMarkdown(e)}`).join("\n");
            return { content: [{ type: "text", text: md }] };
          }

          return {
            content: [{ type: "text", text: JSON.stringify({ resultType: "file_entries", data: entries }, null, 2) }],
          };
        }

        // Broad manifest-level query
        const manifests = await client.queryData({
          schema_name,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            manifests.length === 0
              ? "No matching data entries found."
              : manifests.map(formatManifestMarkdown).join("\n---\n\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ resultType: "manifest_states", data: manifests }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 4. Raw query ─────────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_raw_query",
    {
      title: "Raw GraphQL Query",
      description:
        "Execute a raw GraphQL query against the subgraph for advanced use " +
        "cases not covered by the other tools. Use this when you need to construct " +
        "custom queries with specific filters, nested relations, or ordering that " +
        "the higher-level tools don't expose.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("A raw GraphQL query to execute against the subgraph"),
      },
    },
    async ({ query }) => {
      try {
        const result = await client.rawQuery(query);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
