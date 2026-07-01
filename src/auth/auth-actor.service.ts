import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { Role } from '../roles/roles.enum';
import { Organization } from '../organizations/organization.entity';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { AuthTokenPayload } from './auth.types';

type TenantActorPayload = Pick<
  AuthTokenPayload,
  'sub' | 'email' | 'employeeCode' | 'role'
>;

@Injectable()
export class AuthActorService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly tenantConnectionManager: TenantConnectionManager,
  ) {}

  async resolveTenantEmployee(
    payload: TenantActorPayload,
    tenantDataSource: DataSource,
  ): Promise<Employee | null> {
    if (payload.employeeCode) {
      const byId = await this.employeesService.findById(
        payload.sub,
        tenantDataSource,
      );
      if (byId) {
        return byId;
      }
    }

    if (payload.email) {
      return this.employeesService.findByEmail(payload.email, tenantDataSource);
    }

    return null;
  }

  async resolveTenantEmployeeId(
    payload: TenantActorPayload,
    tenantDataSource: DataSource,
  ): Promise<string | null> {
    const employee = await this.resolveTenantEmployee(payload, tenantDataSource);
    return employee?.id ?? null;
  }

  /**
   * Master login tokens use users.id by default; org admins need employee-scoped
   * subjects so tenant RBAC and portal APIs resolve the correct actor.
   */
  async buildMasterAccessTokenPayload(
    user: {
      id: string;
      email: string;
      role: Role;
      organizationId: string;
    },
    organization: Organization,
  ): Promise<
    Omit<AuthTokenPayload, 'exp' | 'sessionExp'> &
      Partial<Pick<AuthTokenPayload, 'employeeCode' | 'name' | 'mustChangePassword'>>
  > {
    const base = {
      organizationId: user.organizationId,
      organizationSubdomain: organization.subdomain,
      email: user.email,
      role: user.role,
    };

    if (user.role !== Role.ORG_ADMIN) {
      return { sub: user.id, ...base };
    }

    const tenantDataSource =
      await this.tenantConnectionManager.getOrCreateConnection(organization);
    const employee = await this.resolveTenantEmployee(
      { sub: user.id, email: user.email, role: user.role },
      tenantDataSource,
    );

    if (!employee) {
      return { sub: user.id, ...base };
    }

    return {
      sub: employee.id,
      ...base,
      employeeCode: employee.employeeCode,
      name: employee.name,
      mustChangePassword: employee.mustChangePassword,
    };
  }
}
