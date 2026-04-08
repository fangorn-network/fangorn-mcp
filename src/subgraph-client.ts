import { FileByFileField, FileEntry, FileField, GetAllSchemaStatesByOwnerQueryVariables, GetAllSchemaStatesQueryVariables, GetFileEntriesByManifestIdQueryVariables, GetFileFieldsByFileFieldNameQueryVariables, GetFileFieldsByFileIdQueryVariables, GetFilesByFileFieldNameQueryVariables, GetManifestByFileFieldNameValuePairQueryVariables, GetManifestByIdQueryVariables, GetManifestStatesBySchemaNameAndOwnerQueryVariables, GetManifestStatesBySchemaNameQueryVariables, GetSchemasBySchemaIdQueryVariables, GetSchemaStateByNameQueryVariables, getSubgraphClients, Manifest, ManifestByFileField, ManifestState, Schema, SchemaState, Sdk } from "@fangorn-network/subgraph-client";
import { GraphQLClient } from "graphql-request";

// ── Client ──────────────────────────────────────────────────────────────────

export class McpSubgraphClient {
  private url: string;
	private rawClient: GraphQLClient;
	private typedClient: Sdk;

  constructor(url: string) {
    if (!url) {
      throw new Error("SUBGRAPH_URL is required");
    }
		const {client, typedClient} = getSubgraphClients(url);
		this.rawClient = client;
		this.typedClient = typedClient;
    this.url = url;
  }

  // ── Schema Queries ──────────────────────────────────────────────────────

  /** List all schemas, optionally filtered by owner. */
  async listSchemas(args: GetAllSchemaStatesByOwnerQueryVariables): Promise<SchemaState[]> {

		let result;
		if(args.owner) {
			result = await this.typedClient.GetAllSchemaStatesByOwner(args)
		} else {
			const variables: GetAllSchemaStatesQueryVariables = {first: args.first, skip: args.skip}
			result = await this.typedClient.GetAllSchemaStates(variables)
		}

		const schemaStates: SchemaState[] = result.schemaStates

    return schemaStates;
  }

  /** Get a single schema by name. */
  async getSchema(args: GetSchemaStateByNameQueryVariables): Promise<SchemaState | null> {

		const result = await this.typedClient.GetSchemaStateByName(args)
		const schemaStates: SchemaState[] = result.schemaStates

		if (schemaStates.length === 0) {
			return null
		}

    return schemaStates[0]
  }

  /** Get schemas (versions) for a given schema ID. */
  async getSchemaEntries(args: GetSchemasBySchemaIdQueryVariables): Promise<Schema[]> {

		const result = await this.typedClient.GetSchemasBySchemaId(args);

		const schemaStates: SchemaState[] = result.schemaStates;

		let schemas: Schema[] = []

		if (schemaStates.length === 0) {
			return schemas
		}
		if (!schemaStates[0].versions || schemaStates[0].versions.length === 0) {
			return schemas
		}

		return schemaStates[0].versions
  }

  // ── Data Queries ────────────────────────────────────────────────────────

  /** List manifest states, filtered by schema_name and optionally owner. */
  async listManifestStates(args: GetManifestStatesBySchemaNameAndOwnerQueryVariables): Promise<ManifestState[]> {

		let result;
		if(args.owner) {
			result = await this.typedClient.GetManifestStatesBySchemaNameAndOwner(args)
		} else {
			const vars: GetManifestStatesBySchemaNameQueryVariables = {name: args.name, first: args.first, skip: args.skip}
			result = await this.typedClient.GetManifestStatesBySchemaName(vars)
		}
		const manifestStates: ManifestState[] = result.manifestStates

		return manifestStates
  }

  /**
   * List manifests for a given schema name.
   * Queries manifestStates by schema_name and extracts the manifest child
   * from each, filtering out any null manifests.
   */
  async listManifests(args: GetManifestStatesBySchemaNameAndOwnerQueryVariables): Promise<Manifest[]> {

		let result = await this.listManifestStates(args);

		let manifests = result
      .map((ms) => ms.manifest)
      .filter((m): m is Manifest => m !== null);

			return manifests

  }

  /** Get a single manifest by its ID. */
  async getManifest(args: GetManifestByIdQueryVariables): Promise<Manifest | null> {

		let result = await this.typedClient.GetManifestById(args)

		let manifests: Manifest[] = result.manifests

		if (manifests.length === 0) {
			return null
		}

		return result.manifests[0]
  }

  /** Get file entries for a given manifest ID. */
  async listFileEntries(args: GetFileEntriesByManifestIdQueryVariables): Promise<FileEntry[]> {

		let result = await this.typedClient.GetFileEntriesByManifestId(args)

		return result.files
  }

  /** Get fields for a given file entry ID. */
  async getFields(args: GetFileFieldsByFileIdQueryVariables): Promise<FileField[]> {

		const result = await this.typedClient.GetFileFieldsByFileId(args)

		let files = result.files
		let fileFields: FileField[] = []

		if (files && files.length > 0) {
			if (files[0].fileFields && files[0].fileFields.length > 0) {
				fileFields = files[0].fileFields
			}
		}

		return fileFields

  }

  // ── Search Queries ──────────────────────────────────────────────────────

  /**
   * Search fields within a specific schema.
   * Returns Field[] — use manifestState.id and fileEntry.id to navigate.
   */
async searchManifestsByFieldsAndSchemaName(
  schemaName: string,
  args: GetManifestByFileFieldNameValuePairQueryVariables,
  owner?: string
): Promise<ManifestState[]> {

	let result;
	if (!args.value) {
		result = await this.typedClient.GetManifestByFileFieldName(args);
	} else {
		result = await this.typedClient.GetManifestByFileFieldNameValuePair(args);
	}
  

	console.log("Searching Manifests by fields and schema name")

  const manifests = result.fileFields
    .filter((ff: ManifestByFileField) => {
      const manifestState = ff.file?.manifest?.manifestState;
      if (!manifestState) return false;
      if (manifestState.schemaName !== schemaName) return false;
      if (owner && manifestState.owner !== owner) return false;
      return true;
    })
    .map((ff: ManifestByFileField) => ff.file!.manifest!.manifestState!)
    .filter(
      (m: ManifestState, index: number, self: ManifestState[]) =>
        self.findIndex((other) => other.id === m.id) === index
    );

  return manifests;
}

  /**
   * Search fields across all schemas.
   * Returns Manifest[] — use manifestState.id and fileEntry.id to navigate.
   */
  async searchManifestsByFieldsGlobal(args: GetManifestByFileFieldNameValuePairQueryVariables, ): Promise<ManifestState[]> {

	console.log("Searching Globally")

	console.log(`variables: ${JSON.stringify(args, null, 2)}`)

	let result;
	if (!args.value) {
		result = await this.typedClient.GetManifestByFileFieldName(args);
	} else {
		result = await this.typedClient.GetManifestByFileFieldNameValuePair(args);
	}

  const manifests = result.fileFields
    .filter((ff: ManifestByFileField) => {
      const manifestState = ff.file?.manifest?.manifestState;
      if (!manifestState) return false;
      return true;
    })
    .map((ff: ManifestByFileField) => ff.file!.manifest!.manifestState!)
    .filter(
      (m: ManifestState, index: number, self: ManifestState[]) =>
        self.findIndex((other) => other.id === m.id) === index
    );

		return manifests;

  }

	async searchFilesByFileFieldName(args: GetFilesByFileFieldNameQueryVariables ): Promise<FileEntry[]> {
		console.log("Searching Globally for FileFields")
		const result = await this.typedClient.GetFilesByFileFieldName(args);
		const files = result.fileFields.map((ff: FileByFileField) => ff.file!)
		return files
	}

	// async searchFilesBy(args: GetManifestByFileFieldNameValuePairQueryVariables, ): Promise<ManifestState[]> {

  // ── Raw ─────────────────────────────────────────────────────────────────

  /** Execute a raw GraphQL query. */
  async rawQuery(gql: string): Promise<unknown> {
		return this.rawClient.rawRequest(gql)
  }
}