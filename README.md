# Fangorn MCP Server

An MCP (Model Context Protocol) server that lets AI agents query a Fangorn subgraph schemas and conformant data published by data sources.

## Setup

```bash
pnpm i
cp env.example .env
# Edit .env and set SUBGRAPH_URL
pnpm build
```

## Running

### Local (stdio) — for Claude Desktop, Claude Code, etc.

```bash
pnpm start
# or
TRANSPORT=stdio node build/index.js
```

### Remote (Streamable HTTP) — for networked agents

```bash
TRANSPORT=http PORT=4000 node build/index.js
# Server listens at http://localhost:4000/mcp
```

## Debugging

Use the MCP Inspector to test tools interactively:

```bash
pnpm inspect
```
