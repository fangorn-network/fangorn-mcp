/**
 * SubgraphClient — thin wrapper around your Graph subgraph endpoint.
 * Exposes typed helpers for the four core queries: list schemas, get schema,
 * query data (broad manifest), and query data (specific file-level).
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

export interface QueryDataFilters {
  schema_name: string;
  field_name?: string;
  field_value?: string;
  owner?: string;
  first?: number;
  skip?: number;
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

  /**
   * Query data entries — returns full manifests (all files in a manifest).
   * Good for browsing; may include unrelated files in the same manifest.
   */
  async queryData(filters: QueryDataFilters): Promise<ManifestState[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `manifestState_: {schema_name: "${filters.schema_name}"${
        filters.owner ? `, owner: "${filters.owner}"` : ""
      }}`,
    ];
    if (filters.field_name) {
      whereParts.push(`name: "${filters.field_name}"`);
    }
    if (filters.field_value) {
      whereParts.push(`value: "${filters.field_value}"`);
    }

    const gql = `{
      fields(first: ${first}, skip: ${skip}, where: {${whereParts.join(", ")}}) {
        manifestState {
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
      }
    }`;

    const data = await this.query<{
      fields: Array<{ manifestState: ManifestState }>;
    }>(gql);

    return data.fields.map((f) => f.manifestState);
  }

  /**
   * Query data entries — returns only matching file entries (precise).
   * Uses the fileEntry relation to return just the files whose fields
   * match the given filters.
   */
  async queryDataPrecise(filters: QueryDataFilters): Promise<FileEntry[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `manifestState_: {schema_name: "${filters.schema_name}"${
        filters.owner ? `, owner: "${filters.owner}"` : ""
      }}`,
    ];
    if (filters.field_name) {
      whereParts.push(`name: "${filters.field_name}"`);
    }
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

  /** Execute a raw GraphQL query. */
  async rawQuery(gql: string): Promise<unknown> {
    return this.query<unknown>(gql);
  }
}
