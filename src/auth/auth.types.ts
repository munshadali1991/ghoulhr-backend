import { Role } from '../roles/roles.enum';

export interface AuthTokenPayload {
  sub: string;
  organizationId: string;
  organizationSubdomain: string;
  /** Master `Role` or tenant `EmployeeRole` string */
  role: Role | string;
  email: string;
  exp: number;
  /** Present for tenant employee tokens */
  employeeCode?: string;
  name?: string;
}
