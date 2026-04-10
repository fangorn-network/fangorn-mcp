import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FangornGraphClient,
} from "@fangorn-network/subgraph-client"

const SUBGRAPH_LIST_SCHEMAS = "subgraph_list_all_schemas";
const SUBGRAPH_GET_SCHEMA_BY_NAME = "subgraph_get_schema_by_name";
const SUBGRAPH_GET_SCHEMA_BY_ID = "subgraph_get_schema_by_id";
const SUBGRAPH_LIST_MANIFEST_STATES_BY_SCHEMA_NAME = "subgraph_list_manifest_states_by_schema_name";
const SUBGRAPH_GET_MANIFEST_BY_ID = "subgraph_get_manifest_by_id";
const SUBGRAPH_LIST_FILE_ENTRIES = "subgraph_list_file_entries";
const SUBGRAPH_GET_FILE_BY_ID = "subgraph_get_file_by_id";
const SUBGRAPH_SEARCH_FIELDS = "subgraph_search_fields";
const SUBGRAPH_SEARCH_FIELDS_GLOBAL = "subgraph_search_fields_global";
const SUBGRAPH_RAW_QUERY = "subgraph_raw_query";
const SUBGRAPH_SEARCH_FIELDS_BY_NAME_GLOBAL = "subgraph_search_fields_by_name_global";


export function registerTools(server: McpServer, client: FangornGraphClient) {

  server.registerTool(
    SUBGRAPH_LIST_SCHEMAS,
    {
      title: "List All Schemas",
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
      },
    },
    async ({ owner, first, skip }) => {
      try {
        const schemaStates = await client.getAllSchemaStates({ owner, first, skip });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: schemaStates }),
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
    SUBGRAPH_GET_SCHEMA_BY_NAME,
    {
      title: "Get Schema By Name",
      description:
        "Retrieve a single schema by its fully-qualified name. Returns the entire schema." +
        "This can be used to discover which field names are available for files in manifests that use this schema.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Full schema name (e.g. 'noagent-fangorn.test.music.v0')"),
      },
    },
    async ({ name }) => {
      try {
        const schemaState = await client.getSchemaStateByName({name});

        if (!schemaState) {
          return {
            content: [
              { type: "text", text: `Schema "${name}" not found.` },
            ],
          };
        }

				if (!schemaState.versions || schemaState.versions.length === 0) {
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
              text: JSON.stringify({ resultType: "schemas", data: [schemaState] }),
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
    SUBGRAPH_GET_SCHEMA_BY_ID,
    {
      title: "Get Schema By id",
      description:
        "Retrieve a single schema by its unique id. Returns the entire schema." +
        "This can be used to discover which field names are available for files in manifests that use this schema.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe("The schema id"),
      },
    },
    async ({ id }) => {
      try {
        const schemaState = await client.getSchemaStateById({id});

        if (!schemaState) {
          return {
            content: [
              { type: "text", text: `Schema with id:"${id}" not found.` },
            ],
          };
        }

				if (!schemaState.versions || schemaState.versions.length === 0) {
					return {
            content: [
              { type: "text", text: `Schema with id: "${id}" not found.` },
            ],
          };
				}

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "schemas", data: [schemaState] }),
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
    SUBGRAPH_GET_FILE_BY_ID,
    {
      title: "Get File By id",
      description:
        "Retrieve a single file by its id. Returns the entire file.",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe("The file's id"),
      },
    },
    async ({ id }) => {
      try {
				
        const file = await client.getFileById({id});
        if (!file) {
          return {
            content: [
              { type: "text", text: `File with id:"${id}" not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "files", data: [file] }),
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
    SUBGRAPH_LIST_MANIFEST_STATES_BY_SCHEMA_NAME,
    {
      title: "List Manifest States By Schema Name",
      description:
        "List all manifest states published under a given schema by the schema's name. Each manifest state " +
        "represents a data publication by an owner. Returns the full manifest " +
        "including its file entries, and fields.\n\n" +
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
        const manifestStates = await client.getManifestStatesBySchemaNameAndOwner({
          name: schemaName,
          owner,
          first,
          skip,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates }),
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
    SUBGRAPH_GET_MANIFEST_BY_ID,
    {
      title: "Get Manifest by Manifest State ID",
      description:
        "Retrieve a single manifest by its parent manifest state ID. Returns the full manifest including " +
        "all file entries and their fields.",
      inputSchema: {
        manifestStateId: z
          .string()
          .min(1)
          .describe("The manifest state ID to retrieve")
      },
    },
    async ({ manifestStateId }) => {
      try {
        const manifestState = await client.getManifestStateById({id: manifestStateId});

        if (!manifestState) {
          return {
            content: [
              { type: "text", text: `Manifest "${manifestStateId}" not found.` },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: [manifestState] }),
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
    SUBGRAPH_LIST_FILE_ENTRIES,
    {
      title: "List File Entries",
      description:
        "List all file entries belonging to a specific manifest by the Manifest State's ID. Each file entry " +
        "contains a tag and its associated fields with values fully populated.\n\n",
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
        const entries = await client.getFilesByManifestStateId({
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

        const manifestStates = await client.getManifestStatesByFieldsAndSchemaName(schemaName, {
          name: fieldName,
          value: fieldValue,
          first,
          skip,
        }, owner);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates }),
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
    async ({ fieldName, fieldValue, first, skip }) => {
      try {
        const manifestStates = await client.getManifestsByFields({
          name: fieldName,
          value: fieldValue,
          first,
          skip,
        });
				
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates }),
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
        const files = await client.getFilesByFileFieldName({
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