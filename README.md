# Fangorn MCP Server

An MCP (Model Context Protocol) server that lets AI agents query a Fangorn subgraph — schemas and conformant data published by data sources.

## Tools

| Tool                    |                        Description                          |
|-------------------------|-------------------------------------------------------------|
| `subgraph_list_schemas` | List all registered schemas, optionally filtered by owner   |
| `subgraph_get_schema`   | Get a single schema by name with its field definitions      |
| `subgraph_query_data`   | Query data entries for a schema, with field-level filtering |
| `subgraph_raw_query`    | Run an arbitrary GraphQL query against the subgraph         |

## Setup

```bash
npm install
cp env.example .env
# Edit .env and set SUBGRAPH_URL
pnpm build
```

## Running

### Local (stdio) — for Claude Desktop, Claude Code, etc.

```bash
npm start
# or
TRANSPORT=stdio node build/index.js
```

### Remote (Streamable HTTP) — for networked agents

```bash
TRANSPORT=http PORT=3000 node build/index.js
# Server listens at http://localhost:3000/mcp
```

## Claude Desktop Configuration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fangorn": {
      "command": "node",
      "args": ["/absolute/path/to/fangorn-mcp-server/build/index.js"],
      "env": {
        "SUBGRAPH_URL": "https://your-subgraph-url/graphql"
      }
    }
  }
}
```

## Claude Code Configuration

```bash
claude mcp add fangorn node /absolute/path/to/fangorn-mcp-server/build/index.js \
  -e SUBGRAPH_URL=https://your-subgraph-url/graphql
```

## Remote Client Connection

When running in HTTP mode, clients connect to `http://localhost:3000/mcp` using the Streamable HTTP transport.

## Debugging

Use the MCP Inspector to test tools interactively:

```bash
pnpm inspect
```

## Project Structure

```
fangorn-mcp-server/
├── src/
│   ├── index.ts             # Entry point — transport setup
│   ├── subgraph-client.ts   # GraphQL client for the subgraph
│   └── tools.ts             # MCP tool definitions
├── dist/                   # Compiled JS (after npm run build)
├── env.example             # Environment template
├── package.json
└── tsconfig.json
```
