import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { permissionModuleCode } from './constants/platform-modules.constant';
import { AccessScope } from './constants/access-scope.enum';
import { OrganizationEntitlementService } from './organization-entitlement.service';
import { RbacEmployeeRoleAssignment } from './entities/rbac-employee-role-assignment.entity';
import { RbacRolePermission } from './entities/rbac-role-permission.entity';
import { maxAccessScope } from './utils/access-scope.util';

export interface AuthorizationContext {
  employeeId: string;
  organizationId: string;
  tenantDataSource: DataSource;
}

export interface ResolvedAuthorization {
  roleCodes: string[];
  permissions: string[];
  entitledModules: string[];
  permissionScopes: Map<string, AccessScope>;
}

@Injectable()
export class AuthorizationService {
  private readonly requestCache = new WeakMap<object, Map<string, ResolvedAuthorization>>();

  constructor(
    private readonly entitlementService: OrganizationEntitlementService,
  ) {}

  async resolve(context: AuthorizationContext): Promise<ResolvedAuthorization> {
    const entitledModules = await this.entitlementService.getEntitledModuleCodes(
      context.organizationId,
    );

    const { roleCodes, rawPermissions, permissionScopes } =
      await this.loadTenantPermissions(
        context.tenantDataSource,
        context.employeeId,
      );

    const entitledSet = new Set(entitledModules);
    const permissions = rawPermissions.filter((code) =>
      entitledSet.has(permissionModuleCode(code)),
    );

    const scopedPermissions = new Map<string, AccessScope>();
    for (const [code, scope] of permissionScopes) {
      if (entitledSet.has(permissionModuleCode(code))) {
        scopedPermissions.set(code, scope);
      }
    }

    return {
      roleCodes,
      permissions,
      entitledModules,
      permissionScopes: scopedPermissions,
    };
  }

  async resolveCached(
    cacheKey: object,
    context: AuthorizationContext,
  ): Promise<ResolvedAuthorization> {
    let bucket = this.requestCache.get(cacheKey);
    if (!bucket) {
      bucket = new Map();
      this.requestCache.set(cacheKey, bucket);
    }
    const key = `${context.organizationId}:${context.employeeId}`;
    const hit = bucket.get(key);
    if (hit) return hit;

    const resolved = await this.resolve(context);
    bucket.set(key, resolved);
    return resolved;
  }

  async hasPermission(
    context: AuthorizationContext,
    permissionCode: string,
    cacheKey?: object,
  ): Promise<boolean> {
    const resolved = cacheKey
      ? await this.resolveCached(cacheKey, context)
      : await this.resolve(context);
    return resolved.permissions.includes(permissionCode);
  }

  async hasAnyPermission(
    context: AuthorizationContext,
    permissionCodes: string[],
    cacheKey?: object,
  ): Promise<boolean> {
    const resolved = cacheKey
      ? await this.resolveCached(cacheKey, context)
      : await this.resolve(context);
    return permissionCodes.some((c) => resolved.permissions.includes(c));
  }

  getEffectiveScope(
    resolved: ResolvedAuthorization,
    permissionCode: string,
  ): AccessScope {
    return resolved.permissionScopes.get(permissionCode) ?? AccessScope.SELF;
  }

  private async loadTenantPermissions(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<{
    roleCodes: string[];
    rawPermissions: string[];
    permissionScopes: Map<string, AccessScope>;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const assignments = await dataSource
      .getRepository(RbacEmployeeRoleAssignment)
      .createQueryBuilder('a')
      .innerJoinAndSelect('a.role', 'role')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('role.isActive = true')
      .andWhere('(a.effectiveFrom IS NULL OR a.effectiveFrom <= :today)', { today })
      .andWhere('(a.effectiveTo IS NULL OR a.effectiveTo >= :today)', { today })
      .getMany();

    if (assignments.length === 0) {
      return {
        roleCodes: [],
        rawPermissions: [],
        permissionScopes: new Map(),
      };
    }

    const roleIds = assignments.map((a) => a.roleId);
    const roleCodes = assignments
      .map((a) => a.role?.code)
      .filter((c): c is string => Boolean(c));

    const rolePermRows = await dataSource.getRepository(RbacRolePermission).find({
      where: { roleId: In(roleIds) },
      relations: ['permission'],
    });

    const scopesByCode = new Map<string, AccessScope[]>();
    const rawPermissions: string[] = [];

    for (const row of rolePermRows) {
      const code = row.permission?.code;
      if (!code) continue;
      rawPermissions.push(code);
      const existing = scopesByCode.get(code) ?? [];
      existing.push(row.accessScope ?? AccessScope.SELF);
      scopesByCode.set(code, existing);
    }

    const permissionScopes = new Map<string, AccessScope>();
    for (const [code, scopes] of scopesByCode) {
      permissionScopes.set(code, maxAccessScope(scopes));
    }

    return {
      roleCodes,
      rawPermissions: [...new Set(rawPermissions)],
      permissionScopes,
    };
  }
}
