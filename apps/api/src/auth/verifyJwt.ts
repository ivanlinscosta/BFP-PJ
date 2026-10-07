import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { jwtVerify } from 'jose';
import { NextFunction, Request, Response } from 'express';
import { AppConfig } from '@api/common/config';
import { ForbiddenError, UnauthorizedError } from '@api/common/errors';

function toGroups(value: unknown) {
  if (!value) {
    return [] as string[];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
}

export function createVerifyJwtMiddleware(config: AppConfig) {
  const devSecret = new TextEncoder().encode(config.jwtSecret);
  const cognitoVerifier =
    config.authMode === 'cognito'
      ? CognitoJwtVerifier.create({
          userPoolId: config.cognitoUserPoolId,
          tokenUse: 'access',
          clientId: config.cognitoClientId,
        })
      : null;

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError();
      }

      const token = authorizationHeader.replace('Bearer ', '');

      const payload =
        config.authMode === 'dev'
          ? (await jwtVerify(token, devSecret, { algorithms: ['HS256'] })).payload
          : await cognitoVerifier!.verify(token);

      const groups = toGroups(payload['cognito:groups']);
      const role = groups[0];

      if (!role || (role !== 'admin' && role !== 'analyst' && role !== 'business')) {
        throw new ForbiddenError('JWT does not contain a supported role.');
      }

      req.auth = {
        userId: String(payload.sub ?? ''),
        email: String(payload.email ?? payload.username ?? ''),
        groups: groups as Array<'admin' | 'analyst' | 'business'>,
        role,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        team: typeof payload['custom:team'] === 'string' ? payload['custom:team'] : undefined,
      };

      next();
    } catch (error) {
      next(
        error instanceof UnauthorizedError || error instanceof ForbiddenError
          ? error
          : new UnauthorizedError(),
      );
    }
  };
}
