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
  McpSubgraphClient,
} from "./subgraph-client.js";

// ── Tool Names ──────────────────────────────────────────────────────────────

const SUBGRAPH_LIST_SCHEMAS = "subgraph_list_schemas";
const SUBGRAPH_GET_SCHEMA = "subgraph_get_schema";
const SUBGRAPH_GET_SCHEMAS = "subgraph_get_schema_entries";
const SUBGRAPH_LIST_MANIFEST_STATES = "subgraph_list_manifest_states";
const SUBGRAPH_LIST_MANIFESTS = "subgraph_list_manifests";
const SUBGRAPH_GET_MANIFEST = "subgraph_get_manifest";
const SUBGRAPH_LIST_FILE_ENTRIES = "subgraph_list_file_entries";
const SUBGRAPH_GET_FILE_ENTRIES = "subgraph_get_file_entries";
const SUBGRAPH_GET_FIELDS = "subgraph_get_fields";
const SUBGRAPH_SEARCH_FIELDS = "subgraph_search_fields";
const SUBGRAPH_SEARCH_FIELDS_GLOBAL = "subgraph_search_fields_global";
const SUBGRAPH_RAW_QUERY = "subgraph_raw_query";
const SUBGRAPH_SEARCH_FIELDS_BY_NAME_GLOBAL = "subgraph_search_fields_by_name_global";

// ── Tool Registration ───────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: McpSubgraphClient) {

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
      },
    },
    async ({ owner, first, skip }) => {
      try {
        const schemas = await client.listSchemas({ owner, first, skip });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: schemas }),
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
        name: z
          .string()
          .min(1)
          .describe("Full schema name (e.g. 'noagent-fangorn.test.music.v0')"),
      },
    },
    async ({ name }) => {
      try {
        const schema = await client.getSchema({name});

        if (!schema) {
          return {
            content: [
              { type: "text", text: `Schema "${name}" not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: schema }),
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
    SUBGRAPH_GET_SCHEMAS,
    {
      title: "Get Schema Entries",
      description:
        "Retrieve the version entries (SchemaEntries) for a given schema. " +
        "Each entry includes the version number, spec CID, agent ID, and field definitions. " +
        "Use a schema ID from the list_schemas or get_schema results.",
      inputSchema: {
        schemaId: z
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
          .describe("Number of entries to skip for pagination")
      },
    },
    async ({ schemaId, first, skip }) => {
      try {
        const entries = await client.getSchemaEntries({
          id: schemaId,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schema_entries", data: entries }),
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
        schemaName: z
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
      },
    },
    async ({ schemaName, owner, first, skip }) => {
      try {
        const states = await client.listManifestStates({
          name: schemaName,
          owner,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: states }),
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
        schemaName: z
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
          .describe("Number of manifests to skip for pagination")
      },
    },
    async ({ schemaName, owner, first, skip }) => {
      try {
        const manifests = await client.listManifests({
          name: schemaName,
          owner,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifests", data: manifests }),
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
        manifestId: z
          .string()
          .min(1)
          .describe("The manifest entity ID to retrieve")
      },
    },
    async ({ manifestId }) => {
      try {
        const manifest = await client.getManifest({id: manifestId});

        if (!manifest) {
          return {
            content: [
              { type: "text", text: `Manifest "${manifestId}" not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifests", data: manifest }),
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
        manifestId: z
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
          .describe("Number of file entries to skip for pagination")
      },
    },
    async ({ manifestId, first, skip }) => {
      try {
        const entries = await client.listFileEntries({
          manifestId,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "file_entries", data: entries }),
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
        manifestId: z
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
          .describe("Number of file entries to skip for pagination")
      },
    },
    async ({ manifestId, first, skip }) => {
      try {
        const entries = await client.listFileEntries({
          manifestId,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "file_entries", data: entries }),
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
        fileEntryId: z
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
    async ({ fileEntryId, first, skip }) => {
      try {
        const fields = await client.getFields({
          id: fileEntryId,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "fields", data: fields }),
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
        "Returns Manifests directly.\n\n" +
        "Tip: Use subgraph_get_schema first to discover available field names.",
      inputSchema: {
        schemaName: z
          .string()
          .min(1)
          .describe("Full schema name to search within (e.g. 'noagent-fangorn.test.music.v0')"),
        fieldName: z
          .string()
          .optional()
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
        fieldValue: z
          .string()
          .optional()
          .describe("Exact, case sensitive, value to match (e.g. 'Theo Cappucino' or 'FANGORN'). If omitted, returns all fields matching the name."),
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
          .describe("Number of results to skip for pagination")
      },
    },
    async ({ schemaName, fieldName, fieldValue, owner, first, skip }) => {
      try {

        const manifests = await client.searchManifestsByFieldsAndSchemaName(schemaName, {
          name: fieldName,
          value: fieldValue,
          first,
          skip,
        }, owner);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifests }),
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
        "Search for fields by name and value across ALL schemas and manifests. Returns Manifest " +
        "entities directly. \n\n" +
        "Use this when you want to find collections of data at a higher level without knowing which schema they belong to.",
      inputSchema: {
        fieldName: z
          .string()
          .min(1)
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
        fieldValue: z
          .string()
          .optional()
          .describe("Exact, case sensitive, value to match (e.g. 'Theo Cappucino' or 'FANGORN'). If omitted, returns all fields matching the name."),
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
      },
    },
    async ({ fieldName, fieldValue, owner, first, skip }) => {
      try {
        const fields = await client.searchManifestsByFieldsGlobal({
          name: fieldName,
          value: fieldValue,
          first,
          skip,
        });
				
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: fields }),
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

	server.registerTool(
    SUBGRAPH_SEARCH_FIELDS_BY_NAME_GLOBAL,
    {
      title: "Search for Fields by Name (Global)",
      description:
        "Search for fields by name across ALL schemas and manifests. Returns File " +
        "entities directly. \n\n" +
        "Use this when you want to find data granularly without knowing which schema or manifest it belongs to.",
      inputSchema: {
        fieldName: z
          .string()
          .min(1)
          .describe("Field name to search on (e.g. 'artist', 'title', 'genre')"),
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
      },
    },
    async ({ fieldName, first, skip }) => {
      try {
        const files = await client.searchFilesByFileFieldName({
          name: fieldName,
          first,
          skip,
        });
				
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "file_entries", data: files }),
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
          content: [{ type: "text", text: JSON.stringify({ resultType: "non-standard", data: result }) }],
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