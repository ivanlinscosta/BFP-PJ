import { UserRole } from '@bfp/domain';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  groups: UserRole[];
  role: UserRole;
  name?: string;
  team?: string;
}

export interface AuthResult {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: {
    id: string;
    email: string;
    role: UserRole;
    groups: UserRole[];
    name?: string;
    team?: string;
  };
}
