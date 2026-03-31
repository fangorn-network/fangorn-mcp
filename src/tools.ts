/**
 * Registers all subgraph tools on the McpServer instance.
 *
 * Every tool returns exactly one primitive entity type (or an array of them)
 * with a `resultType` key so the caller knows which entity it received.
 *
 * Entity types: Schema, SchemaEntries, SchemaField, ManifestState,
 *               Manifest, FileEntry, Field, PricingResource
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  SubgraphClient,
  type Schema,
  type SchemaEntries,
  type ManifestState,
  type Manifest,
  type FileEntry,
  type Field,
} from "./subgraph-client.js";

// ── Tool Names ──────────────────────────────────────────────────────────────

const SUBGRAPH_LIST_SCHEMAS = "subgraph_list_schemas";
const SUBGRAPH_GET_SCHEMA = "subgraph_get_schema";
const SUBGRAPH_GET_SCHEMA_ENTRIES = "subgraph_get_schema_entries";
const SUBGRAPH_LIST_MANIFEST_STATES = "subgraph_list_manifest_states";
const SUBGRAPH_LIST_MANIFESTS = "subgraph_list_manifests";
const SUBGRAPH_GET_MANIFEST = "subgraph_get_manifest";
const SUBGRAPH_LIST_FILE_ENTRIES = "subgraph_list_file_entries";
const SUBGRAPH_GET_FILE_ENTRIES = "subgraph_get_file_entries";
const SUBGRAPH_GET_FIELDS = "subgraph_get_fields";
const SUBGRAPH_SEARCH_FIELDS = "subgraph_search_fields";
const SUBGRAPH_SEARCH_FIELDS_GLOBAL = "subgraph_search_fields_global";
const SUBGRAPH_RAW_QUERY = "subgraph_raw_query";

// ── Formatters ──────────────────────────────────────────────────────────────

function formatSchemaMarkdown(s: Schema): string {
  let md = `## ${s.name}\n`;
  md += `- **ID:** \`${s.id}\`\n`;
  md += `- **Schema ID:** \`${s.schemaId}\`\n`;
  md += `- **Owner:** \`${s.owner}\`\n\n`;
  for (const v of s.versions) {
    md += `### Version ${v.version}\n`;
    md += `- **ID:** \`${v.id}\`\n`;
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

function formatSchemaEntriesMarkdown(entries: SchemaEntries[]): string {
  if (entries.length === 0) return "No schema entries found.";
  let md = "";
  for (const v of entries) {
    md += `### Version ${v.version}\n`;
    md += `- **ID:** \`${v.id}\`\n`;
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

function formatManifestStateMarkdown(ms: ManifestState): string {
  let md = `### ManifestState \`${ms.id}\`\n`;
  md += `- **Owner:** \`${ms.owner}\`\n`;
  md += `- **Schema:** ${ms.schema_name}\n`;
  md += `- **Schema ID:** \`${ms.schema_id}\`\n`;
  md += `- **Manifest CID:** \`${ms.manifest_cid}\`\n`;
  md += `- **Version:** ${ms.version}\n`;
  md += `- **Last Updated:** ${ms.lastUpdated}\n\n`;
  if (ms.manifest) {
    md += formatManifestMarkdown(ms.manifest);
  } else {
    md += `_No manifest linked._\n`;
  }
  return md;
}

function formatManifestMarkdown(m: Manifest): string {
  let md = `### Manifest \`${m.id}\`\n`;
  if (m.manifestVersion) md += `- **Version:** ${m.manifestVersion}\n`;
  if (m.schemaId) md += `- **Schema ID:** ${m.schemaId}\n`;
  md += `- **Files:** ${m.files.length}\n\n`;
  for (let i = 0; i < m.files.length; i++) {
    md += `#### File ${i + 1} — \`${m.files[i].id}\`\n`;
    md += formatFileEntryMarkdown(m.files[i]);
    md += "\n";
  }
  return md;
}

function formatFileEntryMarkdown(entry: FileEntry): string {
  let md = "";
  if (entry.tag) md += `- **Tag:** ${entry.tag}\n`;
  md += `- **Manifest:** \`${entry.manifest.id}\`\n`;
  for (const f of entry.fields) {
    const priceInfo =
      f.price ? ` — **${f.price.price} ${f.price.currency}**` : "";
    const accessInfo = f.acc !== "plain" ? ` [${f.acc}]` : "";
    md += `- **${f.name}** (${f.atType}${accessInfo}): ${f.value}${priceInfo}\n`;
  }
  return md;
}

function formatFieldMarkdown(f: Field): string {
  let md = `- **ID:** \`${f.id}\`\n`;
  md += `- **Name:** ${f.name}\n`;
  md += `- **Value:** ${f.value}\n`;
  md += `- **Type:** ${f.atType}\n`;
  md += `- **Access:** ${f.acc}\n`;
  md += `- **ManifestState:** \`${f.manifestState.id}\`\n`;
  if (f.fileEntry) md += `- **FileEntry:** \`${f.fileEntry.id}\`\n`;
  if (f.price) {
    md += `- **Price:** ${f.price.price} ${f.price.currency} (owner: \`${f.price.owner}\`)\n`;
  }
  return md;
}

// ── Tool Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: SubgraphClient) {

  // ── 1. List schemas ──────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_LIST_SCHEMAS,
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
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: schemas }, null, 2),
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

  // ── 2. Get schema ────────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_GET_SCHEMA,
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
          return {
            content: [{ type: "text", text: formatSchemaMarkdown(schema) }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: schema }, null, 2),
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

  // ── 3. Get schema entries ────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_GET_SCHEMA_ENTRIES,
    {
      title: "Get Schema Entries",
      description:
        "Retrieve the version entries (SchemaEntries) for a given schema. " +
        "Each entry includes the version number, spec CID, agent ID, and field definitions. " +
        "Use a schema ID from the list_schemas or get_schema results.",
      inputSchema: {
        schema_id: z
          .string()
          .min(1)
          .describe("The schema entity ID to get entries for"),
        first: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of entries to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of entries to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ schema_id, first, skip, response_format }) => {
      try {
        const entries = await client.getSchemaEntries({
          schemaId: schema_id,
          first,
          skip,
        });

        if (response_format === "markdown") {
          return {
            content: [{ type: "text", text: formatSchemaEntriesMarkdown(entries) }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schema_entries", data: entries }, null, 2),
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

  // ── 4. List manifest states ──────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_LIST_MANIFEST_STATES,
    {
      title: "List Manifest States",
      description:
        "List all manifest states published under a given schema. Each manifest state " +
        "represents a data publication by an owner. Returns the full manifest state " +
        "including its manifest content, file entries, and fields.\n\n" +
        "Tip: Use subgraph_get_schema first to understand the schema's field definitions.",
      inputSchema: {
        schema_name: z
          .string()
          .min(1)
          .describe("Full schema name to list manifest states for (e.g. 'noagent-fangorn.test.music.v0')"),
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
          .describe("Maximum number of manifest states to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of manifest states to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ schema_name, owner, first, skip, response_format }) => {
      try {
        const states = await client.listManifestStates({
          schema_name,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            states.length === 0
              ? "No manifest states found."
              : states.map(formatManifestStateMarkdown).join("\n---\n\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: states }, null, 2),
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

  // ── 5. List manifests ────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_LIST_MANIFESTS,
    {
      title: "List Manifests",
      description:
        "List all manifests published under a given schema name. Returns Manifest " +
        "entities directly, each with its full file entries and fields populated.\n\n" +
        "This queries through manifestStates but returns only the Manifest children, " +
        "filtering out any manifest states that have no linked manifest.\n\n" +
        "Use this when you want the manifest content without the manifest state metadata.",
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
              text: JSON.stringify({ resultType: "manifests", data: manifests }, null, 2),
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

  // ── 6. Get manifest ──────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_GET_MANIFEST,
    {
      title: "Get Manifest",
      description:
        "Retrieve a single manifest by its ID. Returns the full manifest including " +
        "all file entries and their fields. Use a manifest ID from list_manifest_states " +
        "or list_manifests results.\n\n" +
        "This is the bridge between a manifest state (metadata) and its actual content (files/fields).",
      inputSchema: {
        manifest_id: z
          .string()
          .min(1)
          .describe("The manifest entity ID to retrieve"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ manifest_id, response_format }) => {
      try {
        const manifest = await client.getManifest(manifest_id);

        if (!manifest) {
          return {
            content: [
              { type: "text", text: `Manifest "${manifest_id}" not found.` },
            ],
          };
        }

        if (response_format === "markdown") {
          return {
            content: [{ type: "text", text: formatManifestMarkdown(manifest) }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifests", data: manifest }, null, 2),
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

  // ── 7. List file entries ─────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_LIST_FILE_ENTRIES,
    {
      title: "List File Entries",
      description:
        "List all file entries belonging to a specific manifest. Each file entry " +
        "contains a tag and its associated fields with values fully populated.\n\n" +
        "Use a manifest ID from list_manifests, get_manifest, or list_manifest_states results.",
      inputSchema: {
        manifest_id: z
          .string()
          .min(1)
          .describe("The manifest entity ID to list file entries for"),
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
          .describe("Number of file entries to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ manifest_id, first, skip, response_format }) => {
      try {
        const entries = await client.listFileEntries({
          manifestId: manifest_id,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            entries.length === 0
              ? "No file entries found."
              : entries
                  .map(
                    (e, i) =>
                      `### File Entry ${i + 1} — \`${e.id}\`\n${formatFileEntryMarkdown(e)}`
                  )
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

  // ── 8. Get file entries ──────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_GET_FILE_ENTRIES,
    {
      title: "Get File Entries",
      description:
        "Retrieve file entries belonging to a specific manifest. Each file entry " +
        "contains a tag and its associated fields with values.\n\n" +
        "Use a manifest ID from get_manifest or list_manifest_states results.",
      inputSchema: {
        manifest_id: z
          .string()
          .min(1)
          .describe("The manifest entity ID to get file entries for"),
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
          .describe("Number of file entries to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ manifest_id, first, skip, response_format }) => {
      try {
        const entries = await client.getFileEntries({
          manifestId: manifest_id,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            entries.length === 0
              ? "No file entries found."
              : entries
                  .map(
                    (e, i) =>
                      `### File Entry ${i + 1} — \`${e.id}\`\n${formatFileEntryMarkdown(e)}`
                  )
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

  // ── 9. Get fields ────────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_GET_FIELDS,
    {
      title: "Get Fields",
      description:
        "Retrieve fields belonging to a specific file entry. Each field includes " +
        "its name, value, type, access level, and optional pricing.\n\n" +
        "Use a file entry ID from get_file_entries or get_manifest results.",
      inputSchema: {
        file_entry_id: z
          .string()
          .min(1)
          .describe("The file entry entity ID to get fields for"),
        first: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of fields to return"),
        skip: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of fields to skip for pagination"),
        response_format: z
          .enum(["markdown", "json"])
          .default("json")
          .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable"),
      },
    },
    async ({ file_entry_id, first, skip, response_format }) => {
      try {
        const fields = await client.getFields({
          fileEntryId: file_entry_id,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            fields.length === 0
              ? "No fields found."
              : fields
                  .map((f, i) => `### Field ${i + 1}\n${formatFieldMarkdown(f)}`)
                  .join("\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "fields", data: fields }, null, 2),
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

  // ── 10. Search fields (within schema) ────────────────────────────────────

  server.registerTool(
    SUBGRAPH_SEARCH_FIELDS,
    {
      title: "Search Fields",
      description:
        "Search for fields matching a name and/or value within a specific schema. " +
        "Returns Field entities directly — use the manifestState.id and fileEntry.id " +
        "references on each result to navigate to parent entities.\n\n" +
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
          .describe("Exact value to match (e.g. 'Theo Cappucino'). If omitted, returns all fields matching the name."),
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
          .describe("Maximum number of fields to return"),
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
        const fields = await client.searchFields({
          schema_name,
          field_name,
          field_value,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            fields.length === 0
              ? "No matching fields found."
              : fields
                  .map((f, i) => `### Result ${i + 1}\n${formatFieldMarkdown(f)}`)
                  .join("\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "fields", data: fields }, null, 2),
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

  // ── 11. Search fields global (cross-schema) ──────────────────────────────

  server.registerTool(
    SUBGRAPH_SEARCH_FIELDS_GLOBAL,
    {
      title: "Search Fields (Global)",
      description:
        "Search for fields by name and/or value across ALL schemas. Returns Field " +
        "entities directly — use the manifestState.id reference on each result to " +
        "discover which schema and owner the match belongs to.\n\n" +
        "Use this when you want to find data without knowing which schema it belongs to.",
      inputSchema: {
        field_name: z
          .string()
          .min(1)
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
        field_value: z
          .string()
          .optional()
          .describe("Exact value to match (e.g. 'Theo Cappucino'). If omitted, returns all fields matching the name."),
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
        const fields = await client.searchFieldsGlobal({
          field_name,
          field_value,
          owner,
          first,
          skip,
        });

        if (response_format === "markdown") {
          const md =
            fields.length === 0
              ? "No matching fields found across any schema."
              : fields
                  .map((f, i) => `### Result ${i + 1}\n${formatFieldMarkdown(f)}`)
                  .join("\n");
          return { content: [{ type: "text", text: md }] };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "fields", data: fields }, null, 2),
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

  // ── 12. Raw query ────────────────────────────────────────────────────────

  server.registerTool(
    SUBGRAPH_RAW_QUERY,
    {
      title: "Raw GraphQL Query",
      description:
        "Execute a raw GraphQL query against the subgraph for advanced use " +
        "cases not covered by the other tools. Use this when you need custom " +
        "filters, nested relations, ordering, or aggregations that the " +
        "higher-level tools don't expose.\n\n" +
        "Prefer the higher-level tools when they cover your use case.",
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
          content: [{ type: "text", text: JSON.stringify({ resultType: "non-standard", data: result }, null, 2) }],
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