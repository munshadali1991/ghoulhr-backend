import { SetMetadata } from '@nestjs/common';
import { Role } from '../../roles/roles.enum';
import { EmployeeRole } from '../../employees/employee.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (Role | EmployeeRole)[]) =>
  SetMetadata(ROLES_KEY, roles);
