import { NextFunction, Request, Response } from 'express';
import { BusinessDomain, UserRole } from '@bfp/domain';
import { ForbiddenError, UnauthorizedError } from '@api/common/errors';

export const PERMISSIONS: Record<
  UserRole,
  {
    actions: string[];
    domains: BusinessDomain[] | ['*'];
  }
> = {
  admin: {
    actions: [
      'explore',
      'save_analysis',
      'manage_dashboards',
      'manage_audiences',
      'manage_governance',
      'view_catalog',
      'view_customers',
    ],
    domains: ['*'],
  },
  analyst: {
    actions: [
      'explore',
      'save_analysis',
      'manage_dashboards',
      'manage_audiences',
      'view_catalog',
      'view_customers',
    ],
    domains: ['media', 'acquisition', 'customer360', 'products'],
  },
  business: {
    actions: ['explore', 'view_dashboards', 'view_customers', 'view_catalog'],
    domains: ['customer360', 'products'],
  },
};

export function getAllowedDomains(role: UserRole): BusinessDomain[] | ['*'] {
  return PERMISSIONS[role].domains;
}

export function hasDomainAccess(role: UserRole, domains: readonly BusinessDomain[]) {
  const allowedDomains = getAllowedDomains(role);
  if (allowedDomains[0] === '*') {
    return true;
  }

  const allowedDomainSet = new Set(allowedDomains);
  return domains.every((domain) => allowedDomainSet.has(domain));
}

export function assertDomainAccess(role: UserRole, domains: readonly BusinessDomain[]) {
  if (!hasDomainAccess(role, domains)) {
    throw new ForbiddenError('Your role does not have access to one or more requested domains.');
  }
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      next(
        new ForbiddenError(
          `Role ${req.auth.role} cannot access resources restricted to ${allowedRoles.join(', ')}.`,
        ),
      );
      return;
    }

    next();
  };
}

export function requireRole(requiredRole: UserRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new UnauthorizedError());
      return;
    }

    if (req.auth.role !== requiredRole) {
      next(
        new ForbiddenError(`Role ${req.auth.role} cannot access ${requiredRole}-only resources.`),
      );
      return;
    }

    next();
  };
}
