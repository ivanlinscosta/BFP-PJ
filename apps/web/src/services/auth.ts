import type { UserRole } from '@bfp/domain';
import { LoginRequest, LoginResponse } from '@bfp/schemas';
import {
  apiRequest,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  USER_STORAGE_KEY,
} from './apiClient';

/** Display profile of the signed-in user (role is enforced by the API, never by the UI). */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  team: string;
}

export async function login(payload: LoginRequest) {
  const response = await apiRequest<LoginResponse, LoginRequest>('/auth/login', {
    method: 'POST',
    body: payload,
  });

  setAccessToken(response.accessToken);
  const user: CurrentUser = {
    id: response.user.id,
    email: response.user.email,
    role: response.user.role,
    name: response.user.name ?? response.user.email.split('@')[0] ?? 'Usuário',
    team: response.user.team ?? 'BFP PJ',
  };
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  return response;
}

export function logout() {
  clearAccessToken();
}

export function hasAccessToken() {
  return Boolean(getAccessToken());
}

export function getStoredAccessToken() {
  return getAccessToken();
}

/** Reads the cached display profile written at login. */
export function getCurrentUser(): CurrentUser | null {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

/** Initials for the avatar ("Mariana Souza" → "MS"). */
export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
