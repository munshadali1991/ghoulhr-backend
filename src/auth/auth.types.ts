import { Role } from '../roles/roles.enum';

export interface AuthTokenPayload {
  sub: string;
  organizationId: string;
  organizationSubdomain: string;
  /** Master `Role` or tenant `EmployeeRole` string */
  role: Role | string;
  email: string;
  exp: number;
  /** Unix epoch when the absolute session lifetime ends (from login). */
  sessionExp?: number;
  /** Present for tenant employee tokens */
  employeeCode?: string;
  name?: string;
  /** When true, portal APIs are blocked until password is changed */
  mustChangePassword?: boolean;
}
