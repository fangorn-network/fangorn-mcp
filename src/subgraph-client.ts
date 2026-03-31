/**
 * SubgraphClient — thin wrapper around your Graph subgraph endpoint.
 *
 * Every public method returns one of the subgraph's primitive entity types
 * (or an array of them). No coerced wrapper types.
 *
 * Navigation pattern:
 *   Schema → SchemaEntries → SchemaField
 *   ManifestState → Manifest → FileEntry → Field → PricingResource
 */

// ── Primitive Entity Types ──────────────────────────────────────────────────

export interface PricingResource {
  id: string;
  owner: string;
  price: string;
  currency: string;
}

export interface Field {
  id: string;
  name: string;
  value: string;
  atType: string;
  acc: string;
  manifestState: { id: string };
  fileEntry: { id: string } | null;
  price: PricingResource | null;
}

export interface FileEntry {
  id: string;
  tag: string | null;
  manifest: { id: string };
  fields: Field[];
}

export interface Manifest {
  id: string;
  manifestVersion: string | null;
  schemaId: string | null;
  files: FileEntry[];
}

export interface ManifestState {
  id: string;
  owner: string;
  schema_id: string;
  schema: { id: string };
  schema_name: string;
  manifest_cid: string;
  manifest: Manifest | null;
  version: string;
  lastUpdated: string;
}

export interface SchemaField {
  id: string;
  name: string;
  fieldType: string;
}

export interface SchemaEntries {
  id: string;
  version: string;
  spec_cid: string;
  agent_id: string | null;
  fields: SchemaField[];
}

export interface Schema {
  id: string;
  name: string;
  schemaId: string;
  owner: string;
  versions: SchemaEntries[];
}

// ── GraphQL Fragments ───────────────────────────────────────────────────────

const FIELD_FRAGMENT = `
  id
  name
  value
  atType
  acc
  manifestState { id }
  fileEntry { id }
  price {
    id
    owner
    price
    currency
  }
`;

const FILE_ENTRY_FRAGMENT = `
  id
  tag
  manifest { id }
  fields {
    ${FIELD_FRAGMENT}
  }
`;

const MANIFEST_FRAGMENT = `
  id
  manifestVersion
  schemaId
  files {
    ${FILE_ENTRY_FRAGMENT}
  }
`;

const SCHEMA_FIELD_FRAGMENT = `
  id
  name
  fieldType
`;

const SCHEMA_ENTRIES_FRAGMENT = `
  id
  version
  spec_cid
  agent_id
  fields {
    ${SCHEMA_FIELD_FRAGMENT}
  }
`;

const SCHEMA_FRAGMENT = `
  id
  name
  schemaId
  owner
  versions {
    ${SCHEMA_ENTRIES_FRAGMENT}
  }
`;

const MANIFEST_STATE_FRAGMENT = `
  id
  owner
  schema_id
  schema { id }
  schema_name
  manifest_cid
  manifest {
    ${MANIFEST_FRAGMENT}
  }
  version
  lastUpdated
`;

// ── Client ──────────────────────────────────────────────────────────────────

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

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

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
        ${SCHEMA_FRAGMENT}
      }
    }`;

    const data = await this.query<{ schemas: Schema[] }>(gql);
    return data.schemas;
  }

  /** Get a single schema by name. */
  async getSchema(name: string): Promise<Schema | null> {
    const gql = `{
      schemas(where: {name: "${name}"}) {
        ${SCHEMA_FRAGMENT}
      }
    }`;

    const data = await this.query<{ schemas: Schema[] }>(gql);
    return data.schemas[0] ?? null;
  }

  /** Get schema entries (versions) for a given schema ID. */
  async getSchemaEntries(opts: {
    schemaId: string;
    first?: number;
    skip?: number;
  }): Promise<SchemaEntries[]> {
    const first = opts.first ?? 20;
    const skip = opts.skip ?? 0;

    const gql = `{
      schemas(where: {id: "${opts.schemaId}"}) {
        versions(first: ${first}, skip: ${skip}) {
          ${SCHEMA_ENTRIES_FRAGMENT}
        }
      }
    }`;

    const data = await this.query<{ schemas: Array<{ versions: SchemaEntries[] }> }>(gql);
    return data.schemas[0]?.versions ?? [];
  }

  // ── Data Queries ────────────────────────────────────────────────────────

  /** List manifest states, filtered by schema_name and optionally owner. */
  async listManifestStates(filters: {
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
        ${MANIFEST_STATE_FRAGMENT}
      }
    }`;

    const data = await this.query<{ manifestStates: ManifestState[] }>(gql);
    return data.manifestStates;
  }

  /**
   * List manifests for a given schema name.
   * Queries manifestStates by schema_name and extracts the manifest child
   * from each, filtering out any null manifests.
   */
  async listManifests(filters: {
    schema_name: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<Manifest[]> {
    const first = filters.first ?? 20;
    const skip = filters.skip ?? 0;

    const whereParts: string[] = [
      `schema_name: "${filters.schema_name}"`,
    ];
    if (filters.owner) whereParts.push(`owner: "${filters.owner}"`);

    const gql = `{
      manifestStates(first: ${first}, skip: ${skip}, where: {${whereParts.join(", ")}}) {
        manifest {
          ${MANIFEST_FRAGMENT}
        }
      }
    }`;

    const data = await this.query<{
      manifestStates: Array<{ manifest: Manifest | null }>;
    }>(gql);

    return data.manifestStates
      .map((ms) => ms.manifest)
      .filter((m): m is Manifest => m !== null);
  }

  /** Get a single manifest by its ID. */
  async getManifest(id: string): Promise<Manifest | null> {
    const gql = `{
      manifest(id: "${id}") {
        ${MANIFEST_FRAGMENT}
      }
    }`;

    const data = await this.query<{ manifest: Manifest | null }>(gql);
    return data.manifest ?? null;
  }

  /** Get file entries for a given manifest ID. */
  async getFileEntries(opts: {
    manifestId: string;
    first?: number;
    skip?: number;
  }): Promise<FileEntry[]> {
    const first = opts.first ?? 20;
    const skip = opts.skip ?? 0;

    const gql = `{
      fileEntries(first: ${first}, skip: ${skip}, where: {manifest: "${opts.manifestId}"}) {
        ${FILE_ENTRY_FRAGMENT}
      }
    }`;

    const data = await this.query<{ fileEntries: FileEntry[] }>(gql);
    return data.fileEntries;
  }

  /**
   * List file entries for a given manifest ID.
   * Alias for getFileEntries — named for consistency with the list* convention.
   */
  async listFileEntries(filters: {
    manifestId: string;
    first?: number;
    skip?: number;
  }): Promise<FileEntry[]> {
    return this.getFileEntries(filters);
  }

  /** Get fields for a given file entry ID. */
  async getFields(opts: {
    fileEntryId: string;
    first?: number;
    skip?: number;
  }): Promise<Field[]> {
    const first = opts.first ?? 20;
    const skip = opts.skip ?? 0;

    const gql = `{
      fields(first: ${first}, skip: ${skip}, where: {fileEntry: "${opts.fileEntryId}"}) {
        ${FIELD_FRAGMENT}
      }
    }`;

    const data = await this.query<{ fields: Field[] }>(gql);
    return data.fields;
  }

  // ── Search Queries ──────────────────────────────────────────────────────

  /**
   * Search fields within a specific schema.
   * Returns Field[] — use manifestState.id and fileEntry.id to navigate.
   */
  async searchFields(filters: {
    schema_name: string;
    field_name?: string;
    field_value?: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<Field[]> {
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
        ${FIELD_FRAGMENT}
      }
    }`;

    const data = await this.query<{ fields: Field[] }>(gql);
    return data.fields;
  }

  /**
   * Search fields across all schemas.
   * Returns Field[] — use manifestState.id and fileEntry.id to navigate.
   */
  async searchFieldsGlobal(filters: {
    field_name: string;
    field_value?: string;
    owner?: string;
    first?: number;
    skip?: number;
  }): Promise<Field[]> {
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
        ${FIELD_FRAGMENT}
      }
    }`;

    const data = await this.query<{ fields: Field[] }>(gql);
    return data.fields;
  }

  // ── Raw ─────────────────────────────────────────────────────────────────

  /** Execute a raw GraphQL query. */
  async rawQuery(gql: string): Promise<unknown> {
    return this.query<unknown>(gql);
  }
}