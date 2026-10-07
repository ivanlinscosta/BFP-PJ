import type { AppConfig } from '@api/common/config';
import { ApiError } from '@api/common/errors';
import { readJsonSecret } from '@api/services/integrations/secrets';

/** Atlan connection resolved from Secrets Manager (`baseUrl`, `apiToken`, `glossaryGuid`). */
export interface AtlanConnection {
  baseUrl: string;
  apiToken: string;
  glossaryGuid?: string;
}

/** Governance metadata Atlan holds for a data asset or business term. */
export interface AtlanAssetMetadata {
  guid: string;
  typeName: string;
  name: string;
  qualifiedName?: string;
  certificateStatus?: string;
  certificateMessage?: string;
  description?: string;
  owners: string[];
  terms: string[];
  url: string;
}

const ASSET_ATTRIBUTES = [
  'name',
  'qualifiedName',
  'certificateStatus',
  'certificateStatusMessage',
  'description',
  'userDescription',
  'ownerUsers',
  'ownerGroups',
  'meanings',
];

type FetchLike = typeof fetch;

/** Resolves the Atlan connection; null means "não configurado" (the UI shows it as such). */
export async function resolveAtlanConnection(config: AppConfig): Promise<AtlanConnection | null> {
  if (config.atlan.baseUrl && config.atlan.apiToken) {
    return { baseUrl: config.atlan.baseUrl, apiToken: config.atlan.apiToken };
  }

  if (!config.atlan.secretId) {
    return null;
  }

  const secret = await readJsonSecret(config.atlan.secretId, config.awsRegion);
  if (!secret.baseUrl || !secret.apiToken) {
    return null;
  }

  return { baseUrl: secret.baseUrl, apiToken: secret.apiToken, glossaryGuid: secret.glossaryGuid };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Minimal Atlan REST client: index search for assets/terms and bulk upsert of glossary terms.
 * Atlan is the official catalog; BFP reads certification, owners and descriptions from it and
 * publishes its governed metrics as glossary terms.
 */
export class AtlanClient {
  constructor(
    private readonly connection: AtlanConnection,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.connection.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.connection.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new ApiError(502, 'atlan_unavailable', 'O catálogo Atlan não respondeu como esperado.');
    }

    return (await response.json()) as T;
  }

  private toMetadata(entity: {
    guid: string;
    typeName: string;
    attributes?: Record<string, unknown>;
  }): AtlanAssetMetadata {
    const attributes = entity.attributes ?? {};
    const meanings = Array.isArray(attributes.meanings) ? attributes.meanings : [];
    return {
      guid: entity.guid,
      typeName: entity.typeName,
      name: String(attributes.name ?? ''),
      qualifiedName: attributes.qualifiedName ? String(attributes.qualifiedName) : undefined,
      certificateStatus: attributes.certificateStatus
        ? String(attributes.certificateStatus)
        : undefined,
      certificateMessage: attributes.certificateStatusMessage
        ? String(attributes.certificateStatusMessage)
        : undefined,
      description: String(attributes.userDescription ?? attributes.description ?? '') || undefined,
      owners: [...asStrings(attributes.ownerUsers), ...asStrings(attributes.ownerGroups)],
      terms: meanings
        .map((meaning) =>
          meaning && typeof meaning === 'object' && 'displayText' in meaning
            ? String((meaning as { displayText: unknown }).displayText)
            : '',
        )
        .filter(Boolean),
      url: `${this.connection.baseUrl.replace(/\/$/, '')}/assets/${entity.guid}/overview`,
    };
  }

  /** Finds assets of a type by exact name (e.g. Glue tables of the mesh, glossary terms). */
  async findByNames(typeName: string, names: readonly string[]) {
    if (names.length === 0) {
      return [];
    }

    const response = await this.request<{
      entities?: Array<{ guid: string; typeName: string; attributes?: Record<string, unknown> }>;
    }>('/api/meta/search/indexsearch', {
      dsl: {
        size: Math.min(100, names.length * 3),
        query: {
          bool: {
            filter: [
              { term: { '__typeName.keyword': typeName } },
              { term: { __state: 'ACTIVE' } },
              { terms: { 'name.keyword': names } },
            ],
          },
        },
      },
      attributes: ASSET_ATTRIBUTES,
    });

    return (response.entities ?? []).map((entity) => this.toMetadata(entity));
  }

  /** Publishes governed metrics as Atlan glossary terms (create or update by qualified name). */
  async upsertGlossaryTerms(
    terms: Array<{ name: string; description: string; certified: boolean; owner: string }>,
  ) {
    if (!this.connection.glossaryGuid) {
      throw new ApiError(
        422,
        'atlan_glossary_missing',
        'Informe o glossaryGuid do Atlan no segredo de integração para publicar as métricas.',
      );
    }

    const response = await this.request<{ mutatedEntities?: Record<string, unknown[]> }>(
      '/api/meta/entity/bulk',
      {
        entities: terms.map((term) => ({
          typeName: 'AtlasGlossaryTerm',
          attributes: {
            name: term.name,
            qualifiedName: `bfp-pj@${this.connection.glossaryGuid}@${term.name}`,
            userDescription: term.description,
            certificateStatus: term.certified ? 'VERIFIED' : 'DRAFT',
            certificateStatusMessage: `Métrica governada pela BFP-PJ · owner ${term.owner}`,
            anchor: { typeName: 'AtlasGlossary', guid: this.connection.glossaryGuid },
          },
        })),
      },
    );

    return Object.values(response.mutatedEntities ?? {}).reduce(
      (sum, list) => sum + list.length,
      0,
    );
  }
}
