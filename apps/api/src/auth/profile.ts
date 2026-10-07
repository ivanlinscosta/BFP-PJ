import { DEMO_USERS } from '@bfp/domain';
import type { AuthenticatedUser } from './types';

/** Display profile used for ownership metadata. Never derived from client-provided fields. */
export interface UserProfile {
  name: string;
  team: string;
}

/** Resolves the display profile from verified claims, falling back to the demo directory. */
export function resolveUserProfile(auth: AuthenticatedUser): UserProfile {
  const demoUser = DEMO_USERS.find(
    (candidate) => candidate.id === auth.userId || candidate.email === auth.email,
  );

  return {
    name: auth.name ?? demoUser?.name ?? (auth.email.split('@')[0] || 'Usuário'),
    team: auth.team ?? demoUser?.team ?? 'BFP PJ',
  };
}
