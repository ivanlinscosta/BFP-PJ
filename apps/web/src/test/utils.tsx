import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '@/services/apiClient';

export type MockHandler = (request: { url: URL; method: string; body: unknown }) => unknown;

export interface MockRoute {
  method?: string;
  path: string | RegExp;
  status?: number;
  respond: MockHandler | object | null;
}

/** Installs a fetch mock that answers JSON for the given API routes and records calls. */
export function mockApi(routes: MockRoute[]) {
  const calls: Array<{ method: string; url: URL; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const path = url.pathname.replace(/^\/api/, '');
    const route = routes.find(
      (candidate) =>
        (candidate.method ?? 'GET') === method &&
        (typeof candidate.path === 'string' ? candidate.path === path : candidate.path.test(path)),
    );

    if (!route) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not mocked' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload =
      typeof route.respond === 'function'
        ? (route.respond as MockHandler)({ url, method, body })
        : route.respond;
    return new Response(payload === undefined ? null : JSON.stringify(payload), {
      status: route.status ?? (payload === undefined ? 204 : 200),
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

export function signIn(
  user = {
    id: 'usr-analyst',
    email: 'analyst@example.local',
    role: 'analyst',
    name: 'Mariana Souza',
    team: 'Growth PJ',
  },
) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

/** Renders an element inside a memory router + fresh query client. */
export function renderRoute(
  element: ReactElement,
  { path = '/', url = '/' }: { path?: string; url?: string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path, element },
      { path: '*', element: <p>outra rota</p> },
    ],
    { initialEntries: [url] },
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}
