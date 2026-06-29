import { Injectable, Logger } from '@nestjs/common';
import { AuthTokenPayload } from './auth.types';
import { AuthorizationService } from '../rbac/authorization.service';
import { OrganizationEntitlementService } from '../rbac/organization-entitlement.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { EmployeesService } from '../employees/employees.service';
import { Role } from '../roles/roles.enum';

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly entitlementService: OrganizationEntitlementService,
    private readonly organizationsService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly employeesService: EmployeesService,
  ) {}

  async buildSessionResponse(payload: AuthTokenPayload) {
    const user = this.mapSessionUser(payload);

    if (payload.role === Role.SUPER_ADMIN) {
      return {
        user,
        entitledModules: [],
        permissions: ['platform:super-admin'],
        roles: [Role.SUPER_ADMIN],
      };
    }

    const org = await this.organizationsService.findById(payload.organizationId);
    if (!org) {
      return { user, entitledModules: [], permissions: [], roles: [] };
    }

    try {
      const tenantDataSource =
        await this.tenantConnectionManager.getOrCreateConnection(org);

      let employeeId: string | undefined = payload.employeeCode
        ? payload.sub
        : undefined;

      let employeeRecord = employeeId
        ? await this.employeesService.findById(employeeId, tenantDataSource)
        : null;

      if (!employeeId && payload.email) {
        employeeRecord = await this.employeesService.findByEmail(
          payload.email,
          tenantDataSource,
        );
        employeeId = employeeRecord?.id;
      }

      if (employeeId && employeeRecord) {
        const profilePhotoUrl = await this.employeesService.resolveProfilePhotoPreview(
          payload.organizationId,
          employeeRecord.profilePhotoStorageKey,
          employeeRecord.profilePhotoUrl,
        );

        const enrichedUser = {
          ...user,
          ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
        };

        const auth = await this.authorizationService.resolve({
          employeeId,
          organizationId: payload.organizationId,
          tenantDataSource,
        });

        const roles =
          auth.roleCodes.length > 0
            ? auth.roleCodes
            : payload.role
              ? [payload.role]
              : [];

        return {
          user: enrichedUser,
          entitledModules: auth.entitledModules,
          permissions: auth.permissions,
          roles,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Tenant RBAC session fallback for ${payload.email}: ${error instanceof Error ? error.message : error}`,
      );
    }

    const entitledModules = await this.entitlementService.getEntitledModuleCodes(
      payload.organizationId,
    );
    return {
      user,
      entitledModules,
      permissions: [],
      roles: payload.role ? [payload.role] : [],
    };
  }

  private mapSessionUser(payload: AuthTokenPayload) {
    return {
      id: payload.sub,
      organizationId: payload.organizationId,
      organizationSubdomain: payload.organizationSubdomain,
      email: payload.email,
      role: payload.role,
      ...(payload.employeeCode ? { employeeCode: payload.employeeCode } : {}),
      ...(payload.name ? { name: payload.name } : {}),
    };
  }
}
