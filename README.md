# Fangorn MCP Server

An MCP (Model Context Protocol) server that lets AI agents query a Fangorn subgraph schemas and conformant data published by data sources.

## Setup

```bash
pnpm i
cp env.example .env
# Edit .env and set SUBGRAPH_URL and SUBGRAPH_API_KEY (if calling published Subgraph)
pnpm build
```

### Docker

To build the docker image, run:

``` sh
docker build -f Dockerfile \
  -t tag/fangorn-network/mcp:latest .
```

where the tag is your desired registry/namesepace, e.g. for the GCP docker image registry `us-central1-docker.pkg.dev/lucky-lead-489114-d7`

## Running

### Local (stdio)

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

### Docker

After configuring .env, from the root run:

``` sh
docker compose up
```

## Remote Client Connection

When running in HTTP mode, clients connect to `http://localhost:4000/mcp` using the Streamable HTTP transport.

## Debugging

Use the MCP Inspector to test tools interactively:

```bash
pnpm inspect
```
