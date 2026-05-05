import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ChromaClient } from "chromadb";
import { z } from "zod";
import { FangornGraphClient } from "@fangorn-network/subgraph-client";

const SEARCH_DATASOURCES = "search_datasources";
const GET_ALL_SCHEMAS = "get_all_schemas";
const GET_SCHEMA_BY_NAME = "get_schema_by_name";
const GET_SCHEMA_BY_ID = "get_schema_by_id";
const GET_MANIFESTS_BY_SCHEMA = "get_manifests_by_schema_id";
const RAW_QUERY = "subgraph_raw_query";

export function registerTools(
  server: McpServer,
  graphClient: FangornGraphClient,
  chroma: ChromaClient,
  chromaCollection: string = "fangorn",
) {

  // ── 1. Semantic search (replaces all file/manifest field tools) ───────────

  server.registerTool(
    SEARCH_DATASOURCES,
    {
      title: "Search Datasources",
      description:
        "Semantic search over all ingested datasources. Use natural language — " +
        "the query does not need to match exact field names or values. " +
        "Examples: 'tracks with the feeling of an autumn breeze', " +
        "'melancholic jazz from the 90s', 'upbeat electronic music for working'. " +
        "Optionally filter by owner address or schema ID. " +
        "Returns the most relevant results ranked by similarity.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Natural language search query"),
        nResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of results to return"),
        owner: z
          .string()
          .optional()
          .describe("Filter by datasource owner address (e.g. 0x147c...)"),
        schemaId: z
          .string()
          .optional()
          .describe("Filter by schema ID (bytes32 hex)"),
      },
    },
    async ({ query, nResults, owner, schemaId }) => {
      try {
        const collection = await chroma.getCollection({ name: chromaCollection });

        const where: Record<string, string> = {};
        if (owner) where["owner"] = owner;
        if (schemaId) where["schemaId"] = schemaId;

        const results = await collection.query({
          queryTexts: [query],
          nResults,
          where: Object.keys(where).length > 0 ? where : undefined,
          include: ["documents", "metadatas", "distances"] as any,
        });

        // TODO: this is incredibly unsafe!!!!!
        const hits = results.ids[0].map((id, i) => ({
          id,
          score: +(1 - results.distances![0][i]!).toFixed(4),
          document: results.documents[0][i],
          manifestCid: results.metadatas![0][i]!.manifestCid,
          name: results.metadatas![0][i]!.manifestName,
          owner: results.metadatas![0][i]!.owner,
          schemaId: results.metadatas![0][i]!.schemaId,
          version: results.metadatas![0][i]!.version,
        }));

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ resultType: "datasources", data: hits, displayData: true }),
          }],
        };
      } catch (err) {
        console.error(`Error from tool ${SEARCH_DATASOURCES}`, err);
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 2. Schema tools (subgraph still valid for these) ─────────────────────

  server.registerTool(
    GET_ALL_SCHEMAS,
    {
      title: "Get All Schemas",
      description:
        "Get all registered schemas. Use this to discover what types of data exist in the network.",
      inputSchema: {
        owner: z.string().optional().describe("Filter by owner address"),
        first: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
    },
    async ({ owner, first, skip }) => {
      try {
        const schemas = await graphClient.getAllSchemaStates({ owner, first, skip });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ resultType: "schemas", data: schemas, displayData: true }),
          }],
        };
      } catch (err) {
        console.error(`Error from tool ${GET_ALL_SCHEMAS}`, err);
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
      description: "Retrieve a schema by its fully-qualified name (e.g. 'noagent-fangorn.test.music.v0').",
      inputSchema: {
        name: z.string().min(1).describe("Full schema name"),
      },
    },
    async ({ name }) => {
      try {
        const schema = await graphClient.getSchemaStateByName({ name });
        if (!schema?.versions?.length) {
          return { content: [{ type: "text", text: `Schema "${name}" not found.` }] };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ resultType: "schemas", data: [schema], displayData: true }),
          }],
        };
      } catch (err) {
        console.error(`Error from tool ${GET_SCHEMA_BY_NAME}`, err);
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
      title: "Get Schema By ID",
      description: "Retrieve a schema by its unique ID. Prefer this over name lookup.",
      inputSchema: {
        id: z.string().min(1).describe("Schema ID (bytes32 hex)"),
      },
    },
    async ({ id }) => {
      try {
        const schema = await graphClient.getSchemaStateById({ id });
        if (!schema?.versions?.length) {
          return { content: [{ type: "text", text: `Schema "${id}" not found.` }] };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ resultType: "schemas", data: [schema], displayData: true }),
          }],
        };
      } catch (err) {
        console.error(`Error from tool ${GET_SCHEMA_BY_ID}`, err);
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 3. Raw manifest event lookup (chain of custody, not content search) ───

  server.registerTool(
    GET_MANIFESTS_BY_SCHEMA,
    {
      title: "Get Manifest Events by Schema ID",
      description:
        "Get raw on-chain manifest publish/update events for a given schema. " +
        "Returns CIDs and block metadata — use this for provenance or to inspect " +
        "what has been published, not for content search (use search_datasources for that).",
      inputSchema: {
        schemaId: z.string().min(1).describe("Schema ID (bytes32 hex)"),
        first: z.number().int().min(1).max(100).default(20),
        skip: z.number().int().min(0).default(0),
      },
    },
    async ({ schemaId, first, skip }) => {
      try {
        const result = await graphClient.rawQuery(`
          {
            manifestPublisheds(
              where: { schemaId: "${schemaId}" }
              first: ${first}
              skip: ${skip}
              orderBy: blockNumber
              orderDirection: desc
            ) {
              id owner schemaId name manifestCid blockNumber blockTimestamp transactionHash
            }
          }
        `);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ resultType: "manifest_events", data: result, displayData: true }),
          }],
        };
      } catch (err) {
        console.error(`Error from tool ${GET_MANIFESTS_BY_SCHEMA}`, err);
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ── 4. Raw subgraph escape hatch ──────────────────────────────────────────

  server.registerTool(
    RAW_QUERY,
    {
      title: "Raw GraphQL Query",
      description:
        "Execute a raw GraphQL query against the subgraph. Only useful for on-chain event data " +
        "(ManifestPublished, ManifestUpdated, SchemaRegistered, SchemaUpdated, ResourceCreated, PriceUpdated). " +
        "For content search use search_datasources instead.",
      inputSchema: {
        query: z.string().min(1).describe("Raw GraphQL query"),
      },
    },
    async ({ query }) => {
      try {
        const result = await graphClient.rawQuery(query);
        return {
          content: [{ type: "text", text: JSON.stringify({ resultType: "raw", data: result, displayData: false }) }],
        };
      } catch (err) {
        console.error(`Error from tool ${RAW_QUERY}`, err);
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}