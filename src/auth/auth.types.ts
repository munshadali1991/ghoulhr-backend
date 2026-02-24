import { Role } from '../roles/roles.enum';

export interface AuthTokenPayload {
  sub: string;
  organizationId: string;
  organizationSubdomain: string;
  role: Role;
  email: string;
  exp: number;
}
