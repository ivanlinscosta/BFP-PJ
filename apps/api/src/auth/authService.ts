import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SignJWT, decodeJwt } from 'jose';
import { DEMO_PASSWORD, DEMO_USERS, USER_ROLES, type DemoUser, type UserRole } from '@bfp/domain';
import { AppConfig } from '@api/common/config';
import { UnauthorizedError } from '@api/common/errors';
import { AuthResult } from './types';

const encoder = new TextEncoder();

export class AuthService {
  private readonly cognitoClient: CognitoIdentityProviderClient;

  constructor(private readonly config: AppConfig) {
    this.cognitoClient = new CognitoIdentityProviderClient({ region: config.awsRegion });
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (this.config.authMode === 'dev') {
      return this.loginWithDevUser(email, password);
    }

    const response = await this.cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.config.cognitoClientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    );

    const authenticationResult = response.AuthenticationResult;
    if (!authenticationResult?.AccessToken) {
      throw new UnauthorizedError('Cognito authentication failed.');
    }

    // The ID token was just issued by Cognito over TLS; it is decoded only to build the
    // display profile. Every API call still verifies the access token signature and groups.
    const claims = authenticationResult.IdToken ? decodeJwt(authenticationResult.IdToken) : {};
    const groups = (Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : [])
      .map(String)
      .filter((group): group is UserRole => (USER_ROLES as readonly string[]).includes(group));
    const role = groups[0];
    if (!role) {
      throw new UnauthorizedError('O usuário não pertence a nenhum grupo autorizado.');
    }

    return {
      accessToken: authenticationResult.AccessToken,
      idToken: authenticationResult.IdToken,
      refreshToken: authenticationResult.RefreshToken,
      expiresIn: authenticationResult.ExpiresIn ?? 0,
      tokenType: 'Bearer',
      user: {
        id: typeof claims.sub === 'string' ? claims.sub : email,
        email,
        role,
        groups,
        name: typeof claims.name === 'string' ? claims.name : undefined,
        team: typeof claims['custom:team'] === 'string' ? claims['custom:team'] : undefined,
      },
    };
  }

  async issueDevAccessToken(
    user: Pick<DemoUser, 'id' | 'email' | 'role'> & Partial<Pick<DemoUser, 'name' | 'team'>>,
  ) {
    return new SignJWT({
      email: user.email,
      name: user.name,
      'custom:team': user.team,
      'cognito:groups': [user.role],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(encoder.encode(this.config.jwtSecret));
  }

  private async loginWithDevUser(email: string, password: string): Promise<AuthResult> {
    const user = DEMO_USERS.find((candidate) => candidate.email === email);

    if (!user || password !== DEMO_PASSWORD) {
      throw new UnauthorizedError('Invalid development credentials.');
    }

    const accessToken = await this.issueDevAccessToken(user);
    return {
      accessToken,
      expiresIn: 28_800,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        groups: [user.role],
        name: user.name,
        team: user.team,
      },
    };
  }
}
