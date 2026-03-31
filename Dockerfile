FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN npm install -g pnpm@10.32.0

FROM base AS build
COPY . /app
WORKDIR /app
RUN pnpm install --frozen-lockfile
RUN rm -rf examples
RUN pnpm prune --prod

FROM base AS fangorn-mcp-server
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]