import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const cache = new Map<string, { expiresAt: number; value: Record<string, string> }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Reads a JSON secret from AWS Secrets Manager (cached for 5 minutes). Values never leave the
 * backend and are never logged. Returns an empty object when the secret is not filled yet.
 */
export async function readJsonSecret(secretId: string, region: string) {
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = new SecretsManagerClient({ region });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  let value: Record<string, string> = {};
  try {
    const parsed = JSON.parse(response.SecretString ?? '{}') as Record<string, unknown>;
    value = Object.fromEntries(
      Object.entries(parsed)
        .filter(([, entry]) => typeof entry === 'string' && entry.trim() !== '')
        .map(([key, entry]) => [key, String(entry).trim()]),
    );
  } catch {
    value = {};
  }

  cache.set(secretId, { expiresAt: Date.now() + TTL_MS, value });
  return value;
}
