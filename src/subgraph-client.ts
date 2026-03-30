/**
 * SubgraphClient — thin wrapper around your Graph subgraph endpoint.
 * Exposes typed helpers for core queries: list schemas, get schema,
 * list manifests (data browsing), search fields (precise filtering),
 * and raw GraphQL.
 */

export interface SubgraphField {
  name: string;
  value: string;
  atType: string;
  acc: string;
  price: { id: string; price: string; currency: string } | null;
}

export interface FileEntry {
  fields: SubgraphField[];
}

export interface SearchResult {
  schema_name: string;
  owner: string;
  fileEntry: FileEntry;
}

export interface Manifest {
  files: FileEntry[];
}

export interface ManifestState {
  owner: string;
  schema_name: string;
  manifest: Manifest;
}

export interface SchemaField {
  name: string;
  fieldType: string;
}

export interface SchemaVersion {
  version: string;
  spec_cid: string;
  agent_id: string | null;
  fields: SchemaField[];
}

export interface Schema {
  name: string;
  schemaId: string;
  owner: string;
  versions: SchemaVersion[];
}

export class SubgraphClient {
  private url: string;

  constructor(url: string) {
    if (!url) {
      throw new Error("SUBGRAPH_URL is required");
    }
    this.url = url;
  }

  private async query<T>(graphql: string): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: graphql }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Subgraph request failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      throw new Error(
        `Subgraph query errors: ${json.errors.map((e) => e.message).join("; ")}`
      );
    }

    return json.data as T;
  }

  // ── Schema Queries ──────────────────────────────────────────────────────

  /** List all schemas, optionally filtered by owner. */
  async listSchemas(opts?: {
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<Schema[]> {
    const first = opts?.first ?? 20;
    const skip = opts?.skip ?? 0;

    const whereParts: string[] = [];
    if (opts?.owner) whereParts.push(`owner: "${opts.owner}"`);
    const whereClause = whereParts.length
      ? `where: {${whereParts.join(", ")}}, `
      : "";

    const gql = `{
      schemas(${whereClause}first: ${first}, skip: ${skip}) {
        name
        schemaId
        owner
        versions {
          version
          spec_cid
          agent_id
          fields {
            name
            fieldType
          }
        }
      }
    }`;

    const data = await this.query<{ schemas: Schema[] }>(gql);
    return data.schemas;
  }

  /** Get a single schema by name. */
  async getSchema(name: string): Promise<Schema | null> {
    const gql = `{
      schemas(where: {name: "${name}"}) {
        name
        schemaId
        owner
        versions {
          version
          spec_cid
          agent_id
          fields {
            name
            fieldType
          }
        }
      }
    }`;

    const data = await this.query<{ schemas: Schema[] }>(gql);
    return data.schemas[0] ?? null;
  }

  // ── Data Queries ────────────────────────────────────────────────────────

  /**
   * List manifest states for a given schema.
   * Queries the manifestStates entity directly — no duplicates.
   * Use this for browsing / listing all data published under a schema.
   */
  async listManifests(filters: {
    schema_name: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<ManifestState[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `schema_name: "${filters.schema_name}"`,
    ];
    if (filters.owner) whereParts.push(`owner: "${filters.owner}"`);

    const gql = `{
      manifestStates(first: ${first}, skip: ${skip}, where: {${whereParts.join(", ")}}) {
        owner
        schema_name
        manifest {
          files {
            fields {
              name
              value
              atType
              acc
              price {
                id
                price
                currency
              }
            }
          }
        }
      }
    }`;

    const data = await this.query<{ manifestStates: ManifestState[] }>(gql);
    return data.manifestStates;
  }

  /**
   * Search for specific field values across file entries.
   * Queries the fields entity and returns the parent fileEntry for each match.
   * Use this when you need to find entries where a particular field has a
   * particular value (e.g. artist = "Theo Cappucino").
   */
  async searchFields(filters: {
    schema_name: string;
    field_name?: string;
    field_value?: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<FileEntry[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `manifestState_: {schema_name: "${filters.schema_name}"${
        filters.owner ? `, owner: "${filters.owner}"` : ""
      }}`,
      `name: "${filters.field_name}"`,
    ];
    if (filters.field_value) {
      whereParts.push(`value: "${filters.field_value}"`);
    }

    const gql = `{
      fields(first: ${first}, skip: ${skip}, where: {${whereParts.join(", ")}}) {
        fileEntry {
          fields {
            name
            value
            atType
            acc
            price {
              id
              price
              currency
            }
          }
        }
      }
    }`;

    const data = await this.query<{
      fields: Array<{ fileEntry: FileEntry }>;
    }>(gql);

    return data.fields.map((f) => f.fileEntry);
  }

  /**
   * Search for specific field values across ALL schemas.
   * Queries the fields entity without requiring a schema filter.
   * Returns the matching file entry along with the schema name and owner
   * for context on where each result came from.
   */
  async searchFieldsGlobal(filters: {
    field_name: string;
    field_value?: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<SearchResult[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `name: "${filters.field_name}"`,
    ];
    if (filters.field_value) {
      whereParts.push(`value: "${filters.field_value}"`);
    }
    if (filters.owner) {
      whereParts.push(`manifestState_: {owner: "${filters.owner}"}`);
    }

    const gql = `{
      fields(first: ${first}, skip: ${skip}, where: {${whereParts.join(", ")}}) {
        manifestState {
          owner
          schema_name
        }
        fileEntry {
          fields {
            name
            value
            atType
            acc
            price {
              id
              price
              currency
            }
          }
        }
      }
    }`;

    const data = await this.query<{
      fields: Array<{
        manifestState: { owner: string; schema_name: string };
        fileEntry: FileEntry;
      }>;
    }>(gql);

    return data.fields.map((f) => ({
      schema_name: f.manifestState.schema_name,
      owner: f.manifestState.owner,
      fileEntry: f.fileEntry,
    }));
  }

  /** Execute a raw GraphQL query. */
  async rawQuery(gql: string): Promise<unknown> {
    return this.query<unknown>(gql);
  }
}