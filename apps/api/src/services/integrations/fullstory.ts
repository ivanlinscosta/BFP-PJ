import type { AppConfig } from '@api/common/config';
import { ApiError } from '@api/common/errors';
import { readJsonSecret } from '@api/services/integrations/secrets';

const FULLSTORY_API = 'https://api.fullstory.com';

type FetchLike = typeof fetch;

/** FullStory session (replay) of an identified user. */
export interface FullStorySession {
  sessionId: string;
  createdAt: string;
  url: string;
}

/** Resolves the FullStory API key; null means "não configurado". */
export async function resolveFullStoryKey(config: AppConfig): Promise<string | null> {
  if (config.fullstory.apiKey) {
    return config.fullstory.apiKey;
  }

  if (!config.fullstory.secretId) {
    return null;
  }

  const secret = await readJsonSecret(config.fullstory.secretId, config.awsRegion);
  return secret.apiKey ?? null;
}

/**
 * FullStory server API client. The site and app call FS.identify(<company_id>), so the
 * company id is the FullStory uid used to fetch the digital journey of a company.
 */
export class FullStoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await this.fetchImpl(`${FULLSTORY_API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404) {
      return { sessions: [] } as T;
    }
    if (!response.ok) {
      throw new ApiError(502, 'fullstory_unavailable', 'O FullStory não respondeu como esperado.');
    }

    return (await response.json()) as T;
  }

  /** Most recent session replays of a user (GET /sessions/v2?uid=). */
  async listSessions(uid: string, limit = 20): Promise<FullStorySession[]> {
    const query = new URLSearchParams({ uid, limit: String(limit) });
    const response = await this.call<{
      sessions?: Array<{ sessionId?: string; createdTime?: string | number; fsUrl?: string }>;
    }>(`/sessions/v2?${query.toString()}`);

    return (response.sessions ?? [])
      .filter((session) => session.sessionId && session.fsUrl)
      .map((session) => ({
        sessionId: String(session.sessionId),
        createdAt: new Date(
          typeof session.createdTime === 'number'
            ? session.createdTime * 1000
            : String(session.createdTime),
        ).toISOString(),
        url: String(session.fsUrl),
      }));
  }

  /** Schedules an NDJSON event export of a segment (POST /segments/v1/exports). */
  async startEventExport(segmentId: string, start: string, end: string) {
    const response = await this.call<{ operationId?: string }>('/segments/v1/exports', {
      method: 'POST',
      body: {
        segmentId,
        type: 'TYPE_EVENT',
        format: 'FORMAT_NDJSON',
        timeRange: { start, end },
      },
    });
    if (!response.operationId) {
      throw new ApiError(502, 'fullstory_unavailable', 'O FullStory não iniciou a exportação.');
    }
    return response.operationId;
  }

  /** Polls an export operation; returns the download URL when the export is ready. */
  async getExportLocation(operationId: string) {
    const operation = await this.call<{
      state?: string;
      results?: { searchExportId?: string };
    }>(`/operations/v1/${encodeURIComponent(operationId)}`);

    if (operation.state === 'FAILED') {
      throw new ApiError(502, 'fullstory_export_failed', 'A exportação do FullStory falhou.');
    }
    if (operation.state !== 'COMPLETED' || !operation.results?.searchExportId) {
      return null;
    }

    const results = await this.call<{ location?: string }>(
      `/search/v1/exports/${encodeURIComponent(operation.results.searchExportId)}/results`,
    );
    return results.location ?? null;
  }
}
