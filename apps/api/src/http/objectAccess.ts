import type { ObjectType, SharingLevel } from '@bfp/domain';
import { resolveUserProfile } from '@api/auth/profile';
import type { AuthenticatedUser } from '@api/auth/types';
import { ForbiddenError, NotFoundError } from '@api/common/errors';
import type { ObjectRepository, PersistedObject } from '@api/repositories/types';

/** Effective permission of the current user over a saved object. */
export type ObjectAccess = 'OWNER' | 'EDIT' | 'VIEW';

/** Sharing fields carried by analyses (in metadata) and dashboards (top level). */
export interface SharingFields {
  visibility?: SharingLevel;
  team?: string;
}

/** Resolves the access level of a user, or null when the object is not visible. */
export function resolveObjectAccess(
  persisted: PersistedObject<unknown>,
  sharing: SharingFields,
  auth: AuthenticatedUser,
): ObjectAccess | null {
  if (persisted.userId === auth.userId) {
    return 'OWNER';
  }

  if (auth.role === 'admin') {
    return 'EDIT';
  }

  const viewerTeam = resolveUserProfile(auth).team;
  if (sharing.visibility === 'TEAM' && sharing.team === viewerTeam) {
    return 'EDIT';
  }

  if (sharing.visibility === 'READ_ONLY') {
    return 'VIEW';
  }

  return null;
}

/** Lists the objects owned by the user plus the ones shared with them. */
export async function listVisibleObjects<TValue>(
  repository: ObjectRepository,
  type: ObjectType,
  auth: AuthenticatedUser,
  getSharing: (value: TValue) => SharingFields,
) {
  const [own, shared] = await Promise.all([
    repository.listByType<TValue>(auth.userId, type),
    repository.listShared<TValue>(type),
  ]);
  const byId = new Map<string, { persisted: PersistedObject<TValue>; access: ObjectAccess }>();

  for (const persisted of own) {
    byId.set(persisted.id, { persisted, access: 'OWNER' });
  }

  for (const persisted of shared) {
    if (byId.has(persisted.id)) {
      continue;
    }

    const access = resolveObjectAccess(persisted, getSharing(persisted.value), auth);
    if (access) {
      byId.set(persisted.id, { persisted, access });
    }
  }

  return [...byId.values()];
}

/** Loads a single object and enforces visibility, returning 404 when it is not visible. */
export async function resolveVisibleObject<TValue>(
  repository: ObjectRepository,
  type: ObjectType,
  id: string,
  auth: AuthenticatedUser,
  getSharing: (value: TValue) => SharingFields,
  notFoundMessage: string,
) {
  const own = await repository.get<TValue>(auth.userId, type, id);
  if (own) {
    return { persisted: own, access: 'OWNER' as ObjectAccess };
  }

  const matches = (await repository.findById<TValue>(id)).filter((item) => item.type === type);
  for (const persisted of matches) {
    const access = resolveObjectAccess(persisted, getSharing(persisted.value), auth);
    if (access) {
      return { persisted, access };
    }
  }

  throw new NotFoundError(notFoundMessage);
}

/** Ensures the user can edit an object they can see. */
export function assertCanEdit(access: ObjectAccess, message: string) {
  if (access === 'VIEW') {
    throw new ForbiddenError(message);
  }
}

/** Whether an object must be indexed for other users. */
export function isShared(visibility: SharingLevel | undefined) {
  return visibility === 'TEAM' || visibility === 'READ_ONLY';
}
