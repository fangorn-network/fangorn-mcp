import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FangornGraphClient,
} from "@fangorn-network/subgraph-client"

// Note: Referring to manifest states as manifests in tool descriptions in order to minimize agent confusion

const GET_ALL_SCHEMAS = "get_all_schemas";
const GET_SCHEMA_BY_NAME = "get_schema_by_name";
const GET_SCHEMA_BY_ID = "get_schema_by_id";
const GET_MANIFEST_STATES_BY_SCHEMA_NAME = "get_manifests_by_schema_name";
const GET_MANIFEST_STATE_BY_ID = "get_manifests_by_manifest_state_id";
const GET_FILES_BY_MANIFEST_STATE_ID = "get_files_by_manifest_state_id";
const GET_FILE_BY_ID = "get_file_by_id";
const GET_MANIFEST_STATES_BY_SCHEMA_AND_FILE_FIELDS = "get_manifests_by_schema_name_and_file_fields";
const GET_MANIFEST_STATES_BY_FILE_FIELDS = "get_manifests_by_file_fields";
const GET_FILES_BY_FILE_FIELD_NAME = "get_files_by_file_field_name";
const SUBGRAPH_SEARCH_FIELDS_BY_VALUE_GLOBAL = "get_manifests_by_file_field_value"
const RAW_QUERY = "subgraph_raw_query";


export function registerTools(server: McpServer, client: FangornGraphClient) {

  server.registerTool(
    GET_ALL_SCHEMAS,
    {
      title: "Get All Schemas",
      description:
        "Get all registered schemas in the subgraph. Optionally filter by owner address. \
				 Tip: You can use this to see what type of data is available in the network.",
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
              text: JSON.stringify({ resultType: "schemas", data: schemaStates, displayData: true }),
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
    GET_SCHEMA_BY_NAME,
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
              text: JSON.stringify({ resultType: "schemas", data: [schemaState], displayData: true }),
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
    GET_SCHEMA_BY_ID,
    {
      title: "Get Schema By id",
      description:
        "Retrieve a single schema by its unique id. Returns the entire schema." +
        "This can be used to discover which field names are available for files in manifests that use this schema." +
				"Tip: Prefer searching by ID to avoid making mistakes.",
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
              text: JSON.stringify({ resultType: "schemas", data: [schemaState], displayData: true }),
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
    GET_FILE_BY_ID,
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
              text: JSON.stringify({ resultType: "files", data: [file], displayData: true }),
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
    GET_MANIFEST_STATES_BY_SCHEMA_NAME,
    {
      title: "Get Manifests By Schema Name",
      description:
        "Get all manifests published under a given schema by the schema's name. Returns the full manifest " +
        "including its file entries, and fields.",
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
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates, displayData: true }),
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
    GET_MANIFEST_STATE_BY_ID,
    {
      title: "Get Manifest by Manifest State ID",
      description:
        "Retrieve a single manifest by its manifest state ID. Returns the full manifest.",
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
              text: JSON.stringify({ resultType: "manifest_states", data: [manifestState], displayData: true}),
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
    GET_FILES_BY_MANIFEST_STATE_ID,
    {
      title: "Get File Entries by Manifest State ID",
      description:
        "Get all file entries belonging to a specific manifest by the Manifest State's ID. Each file entry " +
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
              text: JSON.stringify({ resultType: "files", data: entries, displayData: true }),
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
    GET_MANIFEST_STATES_BY_SCHEMA_AND_FILE_FIELDS,
    {
      title: "Get Manifests by Schema Name and File Fields",
      description:
        "Search for fields matching a name and/or value for manifests using a specific schema. " +
        "Returns manifests directly.\n\n" +
        "Tip: Prefer caseSensitive=false when including the fieldValue to find more matches.",
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
          .describe("File field's value to match (e.g. 'Theo Cappucino' or 'FANGORN'). If omitted, returns all fields matching the name."),
				caseSensitive: z
					.boolean()
					.optional()
					.default(false)
					.describe("Whether the File field's value is case sensitive. Tip: Default to caseSensitive = false to find results that may use incorrect casing."),
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
    async ({ schemaName, fieldName, fieldValue, caseSensitive, owner, first, skip }) => {
      try {

        const manifestStates = await client.getManifestStatesByFieldsAndSchemaName(schemaName, caseSensitive, {
          name: fieldName,
          value: fieldValue,
          first,
          skip,
        }, owner);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates, displayData: true }),
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
    GET_MANIFEST_STATES_BY_FILE_FIELDS,
    {
      title: "Get Manifests by File Fields",
      description:
        "Search for Manifests based on file fields across ALL schemas. Returns Manifest " +
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
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates, displayData: true }),
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
    SUBGRAPH_SEARCH_FIELDS_BY_VALUE_GLOBAL,
    {
      title: "Get Manifests by File Values",
      description:
        "Search for Manifests based on file field values across ALL schemas. Returns Manifest " +
        "entities directly.",
      inputSchema: {
        fieldValue: z
          .string()
          .describe("The file field value to match (e.g. 'Theo Cappucino' or 'FANGORN')."),
				caseSensitive: z
					.boolean()
					.default(false)
					.describe("Whether the search is case sensitive. Tip: Prefer caseSensitive=false to find more results."),
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
    async ({ fieldValue, caseSensitive, first, skip }) => {
      try {

				const manifestStates = await client.getManifestStatesByFileFieldValue(caseSensitive, {fieldValue, first, skip})
				
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ resultType: "manifest_states", data: manifestStates, displayData: true }),
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
    GET_FILES_BY_FILE_FIELD_NAME,
    {
      title: "Get Files by File Field Name",
      description:
        "Search for files based on the given file field name across ALL schemas and manifest states. Returns File " +
        "entities directly. \n\n" +
        "Use this when you want to find data granularly without knowing which schema or manifest state it belongs to.",
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
              text: JSON.stringify({ resultType: "files", data: files, displayData: true }),
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
    RAW_QUERY,
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
          content: [{ type: "text", text: JSON.stringify({ resultType: "non-standard", data: result, displayData: false }) }],
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