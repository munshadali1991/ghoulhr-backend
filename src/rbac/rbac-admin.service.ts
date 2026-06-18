import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Employee, EmployeeRole } from '../employees/employee.entity';
import { permissionModuleCode } from './constants/platform-modules.constant';
import { AccessScope } from './constants/access-scope.enum';
import { getDefaultAccessScope } from './constants/role-permission-scopes.constant';
import { parseAccessScope } from './utils/access-scope.util';
import { OrganizationEntitlementService } from './organization-entitlement.service';
import { RbacRole } from './entities/rbac-role.entity';
import { RbacPermission } from './entities/rbac-permission.entity';
import { RbacRolePermission } from './entities/rbac-role-permission.entity';
import { RbacEmployeeRoleAssignment } from './entities/rbac-employee-role-assignment.entity';
import { RbacPermissionAuditLog } from './entities/rbac-permission-audit-log.entity';
import { enrichPermission } from './utils/permission-metadata.util';
import { generateUniqueRoleCode } from './utils/role-code.util';

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  permissionCount: number;
  assignedEmployeeCount: number;
  isEditable: boolean;
  isDeletable: boolean;
}

@Injectable()
export class RbacAdminService {
  constructor(
    private readonly entitlementService: OrganizationEntitlementService,
  ) {}

  private roleFlags(role: RbacRole, assignedEmployeeCount: number) {
    const permissionsLocked = role.isSystem && role.code === 'ORG_ADMIN';
    return {
      isEditable: !permissionsLocked,
      isDeletable: !role.isSystem && assignedEmployeeCount === 0,
    };
  }

  async listRoles(dataSource: DataSource): Promise<RoleListItem[]> {
    const roleRepo = dataSource.getRepository(RbacRole);
    const rpRepo = dataSource.getRepository(RbacRolePermission);
    const assignRepo = dataSource.getRepository(RbacEmployeeRoleAssignment);

    const roles = await roleRepo.find({
      where: { isActive: true },
      order: { isSystem: 'DESC', name: 'ASC' },
    });

    const permissionCounts = await rpRepo
      .createQueryBuilder('rp')
      .select('rp.roleId', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('rp.roleId')
      .getRawMany<{ roleId: string; count: string }>();

    const permCountByRole = new Map(
      permissionCounts.map((r) => [r.roleId, Number(r.count)]),
    );

    const assignmentCounts = await assignRepo
      .createQueryBuilder('a')
      .innerJoin(RbacRole, 'r', 'r.id = a.roleId AND r.isActive = true')
      .select('a.roleId', 'roleId')
      .addSelect('COUNT(DISTINCT a.employeeId)', 'count')
      .groupBy('a.roleId')
      .getRawMany<{ roleId: string; count: string }>();

    const assignCountByRole = new Map(
      assignmentCounts.map((r) => [r.roleId, Number(r.count)]),
    );

    return roles.map((role) => {
      const assignedEmployeeCount = assignCountByRole.get(role.id) ?? 0;
      const flags = this.roleFlags(role, assignedEmployeeCount);
      return {
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isActive: role.isActive,
        permissionCount: permCountByRole.get(role.id) ?? 0,
        assignedEmployeeCount,
        ...flags,
      };
    });
  }

  async listPermissions(dataSource: DataSource, organizationId: string) {
    const entitled = new Set(
      await this.entitlementService.getEntitledModuleCodes(organizationId),
    );
    const perms = await dataSource.getRepository(RbacPermission).find({
      order: { moduleCode: 'ASC', code: 'ASC' },
    });
    return perms
      .filter((p) => entitled.has(p.moduleCode))
      .map(enrichPermission);
  }

  async getRoleDetail(dataSource: DataSource, roleId: string, organizationId: string) {
    const role = await dataSource.getRepository(RbacRole).findOne({
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException('Role not found');

    const entitled = new Set(
      await this.entitlementService.getEntitledModuleCodes(organizationId),
    );

    const rolePermRows = await dataSource.getRepository(RbacRolePermission).find({
      where: { roleId },
      relations: ['permission'],
    });

    const assignRepo = dataSource.getRepository(RbacEmployeeRoleAssignment);
    const assignedEmployeeCount = await assignRepo.count({
      where: { roleId },
    });

    const flags = this.roleFlags(role, assignedEmployeeCount);

    const permissions = rolePermRows
      .filter((row) => row.permission && entitled.has(row.permission.moduleCode))
      .map((row) => ({
        ...enrichPermission(row.permission!),
        accessScope: row.accessScope ?? AccessScope.SELF,
      }));

    return {
      ...role,
      ...flags,
      assignedEmployeeCount,
      permissionCount: permissions.length,
      permissions,
    };
  }

  private looksLikeDepartmentRoleName(name: string): boolean {
    return /\b(engineering|finance|hr|payroll|sales|marketing|operations)\b/i.test(
      name,
    );
  }

  async createRole(
    dataSource: DataSource,
    organizationId: string,
    name: string,
    description: string | undefined,
    actorEmployeeId: string,
  ) {
    const roleRepo = dataSource.getRepository(RbacRole);
    const code = await generateUniqueRoleCode(dataSource, name);

    const role = await roleRepo.save(
      roleRepo.create({
        code,
        name: name.trim(),
        description: description?.trim() || undefined,
        isSystem: false,
        isActive: true,
      }),
    );

    const detail = await this.getRoleDetail(dataSource, role.id, organizationId);
    await this.audit(dataSource, {
      action: 'ROLE_CREATED',
      actorEmployeeId,
      targetType: 'role',
      targetId: role.id,
      after: detail as unknown as Record<string, unknown>,
    });

    return {
      ...detail,
      warning: this.looksLikeDepartmentRoleName(name)
        ? 'Use generic roles (e.g. Manager) and assign department on the employee record instead of department-specific role names.'
        : undefined,
    };
  }

  async updateRole(
    dataSource: DataSource,
    roleId: string,
    organizationId: string,
    updates: { name?: string; description?: string },
    actorEmployeeId: string,
  ) {
    const roleRepo = dataSource.getRepository(RbacRole);
    const role = await roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be renamed');
    }

    const before = await this.getRoleDetail(dataSource, roleId, organizationId);

    if (updates.name !== undefined) {
      role.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      role.description = updates.description.trim() || undefined;
    }
    await roleRepo.save(role);

    const after = await this.getRoleDetail(dataSource, roleId, organizationId);
    await this.audit(dataSource, {
      action: 'ROLE_UPDATED',
      actorEmployeeId,
      targetType: 'role',
      targetId: roleId,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });

    return after;
  }

  async deactivateRole(
    dataSource: DataSource,
    roleId: string,
    organizationId: string,
    actorEmployeeId: string,
  ) {
    const roleRepo = dataSource.getRepository(RbacRole);
    const role = await roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deactivated');
    }

    const assignCount = await dataSource
      .getRepository(RbacEmployeeRoleAssignment)
      .count({ where: { roleId } });
    if (assignCount > 0) {
      throw new BadRequestException(
        'Cannot deactivate a role that is assigned to employees',
      );
    }

    const before = await this.getRoleDetail(dataSource, roleId, organizationId);
    role.isActive = false;
    await roleRepo.save(role);

    await this.audit(dataSource, {
      action: 'ROLE_DEACTIVATED',
      actorEmployeeId,
      targetType: 'role',
      targetId: roleId,
      before: before as unknown as Record<string, unknown>,
      after: { ...before, isActive: false } as unknown as Record<string, unknown>,
    });

    return { id: roleId, isActive: false };
  }

  async cloneRole(
    dataSource: DataSource,
    sourceRoleId: string,
    organizationId: string,
    name: string,
    description: string | undefined,
    actorEmployeeId: string,
  ) {
    const source = await this.getRoleDetail(
      dataSource,
      sourceRoleId,
      organizationId,
    );

    const newRole = await this.createRole(
      dataSource,
      organizationId,
      name,
      description,
      actorEmployeeId,
    );

    const permissionEntries = source.permissions.map((p) => ({
      permissionCode: p.code,
      accessScope: p.accessScope ?? AccessScope.SELF,
    }));
    if (permissionEntries.length > 0) {
      await this.updateRolePermissions(
        dataSource,
        newRole.id,
        organizationId,
        permissionEntries,
        actorEmployeeId,
      );
    }

    const detail = await this.getRoleDetail(dataSource, newRole.id, organizationId);
    await this.audit(dataSource, {
      action: 'ROLE_CLONED',
      actorEmployeeId,
      targetType: 'role',
      targetId: newRole.id,
      before: { sourceRoleId, sourceRoleCode: source.code },
      after: detail as unknown as Record<string, unknown>,
    });

    return detail;
  }

  async updateRolePermissions(
    dataSource: DataSource,
    roleId: string,
    organizationId: string,
    entries: Array<{ permissionCode: string; accessScope?: AccessScope }>,
    actorEmployeeId: string,
  ) {
    const role = await dataSource.getRepository(RbacRole).findOne({
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && role.code === 'ORG_ADMIN') {
      throw new BadRequestException('ORG_ADMIN system role permissions cannot be modified');
    }

    const entitled = new Set(
      await this.entitlementService.getEntitledModuleCodes(organizationId),
    );

    for (const entry of entries) {
      const mod = permissionModuleCode(entry.permissionCode);
      if (!entitled.has(mod)) {
        throw new BadRequestException(
          `Permission "${entry.permissionCode}" requires module "${mod}" which is not entitled for this organization`,
        );
      }
    }

    const permRepo = dataSource.getRepository(RbacPermission);
    const rpRepo = dataSource.getRepository(RbacRolePermission);
    const perms = await permRepo.find();
    const permByCode = new Map(perms.map((p) => [p.code, p]));

    const before = await this.getRoleDetail(dataSource, roleId, organizationId);

    await rpRepo.delete({ roleId });
    for (const entry of entries) {
      const perm = permByCode.get(entry.permissionCode);
      if (!perm) continue;
      const accessScope =
        entry.accessScope ??
        getDefaultAccessScope(role.code, entry.permissionCode);
      await rpRepo.save(
        rpRepo.create({
          roleId,
          permissionId: perm.id,
          accessScope: parseAccessScope(accessScope),
        }),
      );
    }

    const after = await this.getRoleDetail(dataSource, roleId, organizationId);
    await this.audit(dataSource, {
      action: 'ROLE_PERMISSIONS_UPDATED',
      actorEmployeeId,
      targetType: 'role',
      targetId: roleId,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });

    return after;
  }

  async assignEmployeeRoles(
    dataSource: DataSource,
    employeeId: string,
    roleIds: string[],
    actorEmployeeId: string,
    primaryRoleId?: string,
  ) {
    const roleRepo = dataSource.getRepository(RbacRole);
    const assignRepo = dataSource.getRepository(RbacEmployeeRoleAssignment);
    const employeeRepo = dataSource.getRepository(Employee);

    const roles = await roleRepo.find({
      where: { id: In(roleIds), isActive: true },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles are invalid or inactive');
    }

    const before = await assignRepo.find({
      where: { employeeId },
      relations: ['role'],
    });
    await assignRepo.delete({ employeeId });

    const today = new Date().toISOString().slice(0, 10);
    const resolvedPrimary = primaryRoleId ?? roleIds[0];
    for (const roleId of roleIds) {
      await assignRepo.save(
        assignRepo.create({
          employeeId,
          roleId,
          isPrimary: roleId === resolvedPrimary,
          effectiveFrom: today,
          assignedBy: actorEmployeeId,
        }),
      );
    }

    const after = await assignRepo.find({
      where: { employeeId },
      relations: ['role'],
    });

    await this.syncLegacyEmployeeRole(dataSource, employeeId, after);

    await this.audit(dataSource, {
      action: 'EMPLOYEE_ROLES_ASSIGNED',
      actorEmployeeId,
      targetType: 'employee',
      targetId: employeeId,
      before: { assignments: before },
      after: { assignments: after },
    });

    return after;
  }

  private async syncLegacyEmployeeRole(
    dataSource: DataSource,
    employeeId: string,
    assignments: RbacEmployeeRoleAssignment[],
  ) {
    const primary = assignments.find((a) => a.isPrimary) ?? assignments[0];
    if (!primary?.role) return;

    const legacyMap: Record<string, EmployeeRole> = {
      ORG_ADMIN: EmployeeRole.ORG_ADMIN,
      MANAGER: EmployeeRole.MANAGER,
      EMPLOYEE: EmployeeRole.EMPLOYEE,
    };
    const legacyRole = legacyMap[primary.role.code];
    if (!legacyRole) return;

    await dataSource.getRepository(Employee).update(employeeId, {
      role: legacyRole,
    });
  }

  async listEmployeeAssignments(dataSource: DataSource, employeeId: string) {
    return dataSource.getRepository(RbacEmployeeRoleAssignment).find({
      where: { employeeId },
      relations: ['role'],
    });
  }

  async listAuditLogs(
    dataSource: DataSource,
    options: { page?: number; limit?: number; action?: string } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const skip = (page - 1) * limit;

    const repo = dataSource.getRepository(RbacPermissionAuditLog);
    const qb = repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (options.action) {
      qb.andWhere('log.action = :action', { action: options.action });
    }

    const [items, total] = await qb.getManyAndCount();

    const actorIds = [
      ...new Set(items.map((i) => i.actorEmployeeId).filter(Boolean)),
    ] as string[];
    const actors = actorIds.length
      ? await dataSource.getRepository(Employee).find({
          where: { id: In(actorIds) },
          select: ['id', 'name', 'employeeCode'],
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    const enriched = await Promise.all(
      items.map(async (log) => {
        const actor = log.actorEmployeeId
          ? actorById.get(log.actorEmployeeId)
          : undefined;
        const summary = await this.buildAuditSummary(dataSource, log);
        return {
          ...log,
          actorName: actor?.name ?? 'System',
          actorEmployeeCode: actor?.employeeCode,
          summary,
        };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private async buildAuditSummary(
    dataSource: DataSource,
    log: RbacPermissionAuditLog,
  ): Promise<string> {
    switch (log.action) {
      case 'ROLE_CREATED':
        return `Created role "${(log.after as { name?: string })?.name ?? 'Unknown'}"`;
      case 'ROLE_UPDATED':
        return `Updated role "${(log.after as { name?: string })?.name ?? 'Unknown'}"`;
      case 'ROLE_DEACTIVATED':
        return `Deactivated role "${(log.before as { name?: string })?.name ?? 'Unknown'}"`;
      case 'ROLE_CLONED': {
        const after = log.after as { name?: string; code?: string };
        return `Cloned role to "${after?.name ?? 'Unknown'}"`;
      }
      case 'ROLE_PERMISSIONS_UPDATED': {
        const before = log.before as { permissions?: { code: string }[] };
        const after = log.after as { permissions?: { code: string }[]; name?: string };
        const beforeCodes = new Set(before?.permissions?.map((p) => p.code) ?? []);
        const afterCodes = new Set(after?.permissions?.map((p) => p.code) ?? []);
        const added = [...afterCodes].filter((c) => !beforeCodes.has(c)).length;
        const removed = [...beforeCodes].filter((c) => !afterCodes.has(c)).length;
        const roleName = after?.name ?? 'role';
        const parts: string[] = [];
        if (added) parts.push(`added ${added} permission${added === 1 ? '' : 's'}`);
        if (removed) parts.push(`removed ${removed} permission${removed === 1 ? '' : 's'}`);
        return parts.length
          ? `Updated permissions for ${roleName}: ${parts.join(', ')}`
          : `Updated permissions for ${roleName}`;
      }
      case 'EMPLOYEE_ROLES_ASSIGNED': {
        const after = log.after as {
          assignments?: { role?: { name: string } }[];
        };
        const roleNames =
          after?.assignments?.map((a) => a.role?.name).filter(Boolean) ?? [];
        const employee = log.targetId
          ? await dataSource.getRepository(Employee).findOne({
              where: { id: log.targetId },
              select: ['name'],
            })
          : null;
        const who = employee?.name ?? 'employee';
        return `Assigned roles [${roleNames.join(', ')}] to ${who}`;
      }
      default:
        return log.action.replace(/_/g, ' ').toLowerCase();
    }
  }

  private async audit(
    dataSource: DataSource,
    entry: {
      action: string;
      actorEmployeeId: string;
      targetType: string;
      targetId: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ) {
    const repo = dataSource.getRepository(RbacPermissionAuditLog);
    await repo.save(repo.create(entry));
  }
}
