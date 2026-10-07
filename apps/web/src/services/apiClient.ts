import { ApiErrorResponse } from '@bfp/shared';

const DEFAULT_BASE_URL = '/api';
export const TOKEN_STORAGE_KEY = 'bfp_access_token';
export const USER_STORAGE_KEY = 'bfp_user';

type ApiErrorEnvelope = ApiErrorResponse & {
  error: ApiErrorResponse['error'] & {
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAccessToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearAccessToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return;
  }

  clearAccessToken();

  if (window.location.pathname === '/login') {
    return;
  }

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const target = `/login?returnTo=${encodeURIComponent(returnTo)}`;

  window.location.assign(target);
}

function buildHeaders(body: unknown) {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

export function setAccessToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function apiRequest<TResponse, TBody = undefined>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: TBody },
) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: buildHeaders(init?.body),
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const fallback = {
      error: {
        code: 'unknown_error',
        message: response.statusText || 'Request failed.',
      },
    } satisfies ApiErrorEnvelope;
    const parsed = ((await response.json().catch(() => fallback)) as ApiErrorEnvelope) ?? fallback;

    if (response.status === 401) {
      redirectToLogin();
    }

    throw new ApiClientError(
      response.status,
      parsed.error.code,
      parsed.error.message,
      parsed.error.details,
    );
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const text = await response.text();
  return (text ? (JSON.parse(text) as TResponse) : undefined) as TResponse;
}
