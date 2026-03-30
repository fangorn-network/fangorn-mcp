/**
 * Registers all Fangorn subgraph tools on the McpServer instance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SubgraphClient, type FileEntry, type ManifestState, type Schema, type SearchResult } from "./subgraph-client.js";

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

function formatSearchResultMarkdown(result: SearchResult): string {
  let md = `### Schema: \`${result.schema_name}\` | Owner: \`${result.owner}\`\n`;
  md += formatFileEntryMarkdown(result.fileEntry);
  return md;
}

// ── Tool Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: SubgraphClient) {

  // ── 1. List schemas ──────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_list_schemas",
    {
      title: "List Schemas",
      description:
        "List all registered schemas in the subgraph. Optionally filter by owner address. " +
        "Use this as a starting point to discover what schemas exist before querying data.",
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
          content: [{ type: "text", text: JSON.stringify({ resultType: "schemas", data: schemas }, null, 2) }],
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
        "Retrieve a single schema by its fully-qualified name. Returns the schema ID, " +
        "owner, and all version details including field definitions. " +
        "Use this before querying or searching data to discover which field names " +
        "are available for filtering.",
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
          content: [{ type: "text", text: JSON.stringify({ resultType: "schemas", data: schema }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 3. List manifests (browse data) ──────────────────────────────────────

  server.registerTool(
    "subgraph_list_manifests",
    {
      title: "List Manifests",
      description:
        "List all data manifests published under a given schema. Each manifest belongs " +
        "to an owner and contains files whose fields conform to the schema definition. " +
        "This is the primary tool for browsing published data.\n\n" +
        "Returns one result per manifest (no duplicates). Each manifest includes all " +
        "its files and their fields. Encrypted fields show 'enc' as their value with " +
        "an associated price.\n\n" +
        "Tip: Use subgraph_get_schema first to understand the schema's field definitions.",
      inputSchema: {
        schema_name: z
          .string()
          .min(1)
          .describe("Full schema name to list manifests for (e.g. 'noagent-fangorn.test.music.v0')"),
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
          .describe("Maximum number of manifests to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of manifests to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ schema_name, owner, first, skip, response_format }) => {
      try {
        const manifests = await client.listManifests({
          schema_name,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            manifests.length === 0
              ? "No manifests found."
              : manifests.map(formatManifestMarkdown).join("\n---\n\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifests }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 4. Search fields (find specific entries) ─────────────────────────────

  server.registerTool(
    "subgraph_search_fields",
    {
      title: "Search Fields",
      description:
        "Search for file entries where a specific field matches a given value. " +
        "Unlike list_manifests which returns entire manifests, this returns only the " +
        "individual file entries that contain the matching field.\n\n" +
        "Requires a field_name to search on. Optionally provide a field_value to match " +
        "exactly (e.g. field_name='artist', field_value='Theo Cappucino').\n\n" +
        "Each result is a single file entry with all its fields, making this ideal for " +
        "lookups and filtering.\n\n" +
        "Tip: Use subgraph_get_schema first to discover available field names.",
      inputSchema: {
        schema_name: z
          .string()
          .min(1)
          .describe("Full schema name to search within (e.g. 'noagent-fangorn.test.music.v0')"),
        field_name: z
          .string()
          .optional()
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
        field_value: z
          .string()
          .optional()
          .describe("Exact value to match (e.g. 'Theo Cappucino'). If omitted, returns all entries that have the field."),
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
          .describe("Maximum number of file entries to return"),
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
        const entries = await client.searchFields({
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
              ? "No matching file entries found."
              : entries
                  .map((e, i) => `### Entry ${i + 1}\n${formatFileEntryMarkdown(e)}`)
                  .join("\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "file_entries", data: entries }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 5. Global field search (cross-schema) ─────────────────────────────────

  server.registerTool(
    "subgraph_search_fields_global",
    {
      title: "Search Fields (Global)",
      description:
        "Search for file entries by field name and value across ALL schemas. " +
        "Unlike search_fields which requires a schema_name, this searches the " +
        "entire subgraph.\n\n" +
        "Use this when you want to find data without knowing which schema it " +
        "belongs to (e.g. 'find all entries where artist = Theo Cappucino').\n\n" +
        "Each result includes the schema name and owner for context on where " +
        "the match was found.",
      inputSchema: {
        field_name: z
          .string()
          .min(1)
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
        field_value: z
          .string()
          .optional()
          .describe("Exact value to match (e.g. 'Theo Cappucino'). If omitted, returns all entries that have the field."),
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
    async ({ field_name, field_value, owner, first, skip, response_format }) => {
      try {
        const results = await client.searchFieldsGlobal({
          field_name,
          field_value,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            results.length === 0
              ? "No matching entries found across any schema."
              : results
                  .map((r, i) => `### Result ${i + 1}\n${formatSearchResultMarkdown(r)}`)
                  .join("\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "file_entries", data: results }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 6. Raw query ─────────────────────────────────────────────────────────

  server.registerTool(
    "subgraph_raw_query",
    {
      title: "Raw GraphQL Query",
      description:
        "Execute a raw GraphQL query against the subgraph for advanced use " +
        "cases not covered by the other tools. Use this when you need custom " +
        "filters, nested relations, ordering, or aggregations that the " +
        "higher-level tools don't expose.\n\n" +
        "Prefer the higher-level tools (list_schemas, get_schema, list_manifests, " +
        "search_fields, search_fields_global) when they cover your use case.",
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