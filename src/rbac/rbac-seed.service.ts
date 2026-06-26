import { Injectable, Logger } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { Employee } from '../employees/employee.entity';

import { EmployeeAccessControl } from '../employees/entities/employee-access.entity';

import {

  PERMISSION_CATALOG,

  SYSTEM_ROLES,

  employeeRoleToRoleCode,

  portalRoleLabelToRoleCode,

} from './constants/permission-catalog.constant';

import { getDefaultAccessScope } from './constants/role-permission-scopes.constant';

import { AccessScope } from './constants/access-scope.enum';

import { RbacRole } from './entities/rbac-role.entity';

import { RbacPermission } from './entities/rbac-permission.entity';

import { RbacRolePermission } from './entities/rbac-role-permission.entity';

import { RbacEmployeeRoleAssignment } from './entities/rbac-employee-role-assignment.entity';



@Injectable()

export class RbacSeedService {

  private readonly logger = new Logger(RbacSeedService.name);



  async seedTenantRbac(dataSource: DataSource): Promise<void> {

    const roleRepo = dataSource.getRepository(RbacRole);

    const permRepo = dataSource.getRepository(RbacPermission);

    const rpRepo = dataSource.getRepository(RbacRolePermission);



    let upserted = 0;

    for (const def of PERMISSION_CATALOG) {

      const existing = await permRepo.findOne({ where: { code: def.code } });

      if (!existing) {

        await permRepo.save(

          permRepo.create({

            code: def.code,

            moduleCode: def.moduleCode,

            action: def.action,

            description: def.description,

          }),

        );

        upserted += 1;

      } else if (

        existing.moduleCode !== def.moduleCode ||

        existing.action !== def.action ||

        existing.description !== def.description

      ) {

        existing.moduleCode = def.moduleCode;

        existing.action = def.action;

        existing.description = def.description;

        await permRepo.save(existing);

        upserted += 1;

      }

    }

    if (upserted > 0) {

      this.logger.log(`Synced ${upserted} permission catalog entries`);

    }



    const permByCode = new Map(

      (await permRepo.find()).map((p) => [p.code, p]),

    );



    const roleByCode = new Map<string, RbacRole>();

    for (const def of SYSTEM_ROLES) {

      let role = await roleRepo.findOne({ where: { code: def.code } });

      if (!role) {

        role = await roleRepo.save(

          roleRepo.create({

            code: def.code,

            name: def.name,

            description: def.description,

            isSystem: def.isSystem,

            isActive: true,

          }),

        );

      }

      roleByCode.set(def.code, role);



      const seedAllPermissions = def.code === 'ORG_ADMIN';

      const codesToLink = seedAllPermissions

        ? [...permByCode.keys()]

        : def.permissionCodes;



      for (const code of codesToLink) {

        const perm = permByCode.get(code);

        if (!perm) continue;

        const exists = await rpRepo.findOne({

          where: { roleId: role.id, permissionId: perm.id },

        });

        if (!exists) {

          await rpRepo.save(

            rpRepo.create({

              roleId: role.id,

              permissionId: perm.id,

              accessScope: getDefaultAccessScope(def.code, code),

            }),

          );

        }

      }



      await this.syncSystemRoleScopes(dataSource, role, codesToLink, permByCode);

    }



    await this.backfillEmployeeAssignments(dataSource, roleByCode);

    await this.migrateOrgStructurePermissions(dataSource, permByCode);
    await this.migrateDashboardPermissions(dataSource, permByCode);
  }

  /**
   * Grant department/designation permissions to roles that already have employee settings write.
   */
  private async migrateOrgStructurePermissions(
    dataSource: DataSource,
    permByCode: Map<string, RbacPermission>,
  ): Promise<void> {
    const rpRepo = dataSource.getRepository(RbacRolePermission);
    const employeesWrite = permByCode.get('settings.employees:write');
    if (!employeesWrite) return;

    const grantCodes = [
      'settings.departments:read',
      'settings.departments:write',
      'settings.designations:read',
      'settings.designations:write',
    ];

    const rowsWithEmployeesWrite = await rpRepo.find({
      where: { permissionId: employeesWrite.id },
    });

    for (const row of rowsWithEmployeesWrite) {
      for (const code of grantCodes) {
        const perm = permByCode.get(code);
        if (!perm) continue;

        const exists = await rpRepo.findOne({
          where: { roleId: row.roleId, permissionId: perm.id },
        });
        if (exists) continue;

        await rpRepo.save(
          rpRepo.create({
            roleId: row.roleId,
            permissionId: perm.id,
            accessScope: row.accessScope,
          }),
        );
      }
    }
  }

  /** Grant dashboard permissions based on existing ESS or admin access. */
  private async migrateDashboardPermissions(
    dataSource: DataSource,
    permByCode: Map<string, RbacPermission>,
  ): Promise<void> {
    const rpRepo = dataSource.getRepository(RbacRolePermission);
    const permRepo = dataSource.getRepository(RbacPermission);
    const allPerms = await permRepo.find();
    const permById = new Map(allPerms.map((p) => [p.id, p.code]));
    const allRolePerms = await rpRepo.find();

    const roleToCodes = new Map<string, Set<string>>();
    for (const row of allRolePerms) {
      const code = permById.get(row.permissionId);
      if (!code) continue;
      const codes = roleToCodes.get(row.roleId) ?? new Set();
      codes.add(code);
      roleToCodes.set(row.roleId, codes);
    }

    for (const [roleId, codes] of roleToCodes) {
      const codeList = [...codes];
      const grants: string[] = [];

      if (
        codeList.some(
          (c) =>
            c.startsWith('ess.leave:') ||
            c.startsWith('ess.attendance:') ||
            c.startsWith('ess.timesheet:'),
        )
      ) {
        grants.push('dashboard.ess:read');
      }
      if (
        codeList.includes('employees:read') ||
        codeList.includes('settings.organization:read')
      ) {
        grants.push('dashboard.hr:read');
      }
      if (
        codeList.includes('approvals.leave:read') ||
        codeList.includes('approvals.timesheet:read')
      ) {
        grants.push('dashboard.approvals:read');
      }
      if (codeList.includes('payroll:read')) {
        grants.push('dashboard.payroll:read');
      }
      if (
        codeList.includes('employees:read') &&
        (codeList.includes('approvals.leave:act') ||
          codeList.includes('approvals.timesheet:act'))
      ) {
        grants.push('dashboard.manager:read');
      }

      const sampleRow = allRolePerms.find((r) => r.roleId === roleId);
      for (const code of [...new Set(grants)]) {
        const perm = permByCode.get(code);
        if (!perm) continue;
        const exists = await rpRepo.findOne({
          where: { roleId, permissionId: perm.id },
        });
        if (exists) continue;
        await rpRepo.save(
          rpRepo.create({
            roleId,
            permissionId: perm.id,
            accessScope: sampleRow?.accessScope ?? AccessScope.ORGANIZATION,
          }),
        );
      }
    }

    await this.revokeMisassignedHrDashboard(dataSource, permByCode, roleToCodes);
  }

  /**
   * Remove dashboard.hr:read from roles that only qualified via payroll:read
   * (payroll access belongs on dashboard.payroll:read, not the org admin dashboard).
   */
  private async revokeMisassignedHrDashboard(
    dataSource: DataSource,
    permByCode: Map<string, RbacPermission>,
    roleToCodes: Map<string, Set<string>>,
  ): Promise<void> {
    const rpRepo = dataSource.getRepository(RbacRolePermission);
    const hrDashboard = permByCode.get('dashboard.hr:read');
    if (!hrDashboard) return;

    for (const [roleId, codes] of roleToCodes) {
      if (!codes.has('dashboard.hr:read')) continue;

      const qualifies =
        codes.has('employees:read') || codes.has('settings.organization:read');

      if (!qualifies) {
        await rpRepo.delete({ roleId, permissionId: hrDashboard.id });
      }
    }
  }

  /** Upsert default access scopes for system role permissions. */

  private async syncSystemRoleScopes(

    dataSource: DataSource,

    role: RbacRole,

    permissionCodes: string[],

    permByCode: Map<string, RbacPermission>,

  ) {

    if (!role.isSystem) return;



    const rpRepo = dataSource.getRepository(RbacRolePermission);

    for (const code of permissionCodes) {

      const perm = permByCode.get(code);

      if (!perm) continue;



      const expectedScope = getDefaultAccessScope(role.code, code);

      const row = await rpRepo.findOne({

        where: { roleId: role.id, permissionId: perm.id },

      });

      if (!row) continue;



      if (row.accessScope !== expectedScope) {

        row.accessScope = expectedScope;

        await rpRepo.save(row);

      }

    }

  }



  /**

   * Assign a primary system RBAC role to an employee (idempotent).

   */

  async assignPrimarySystemRole(

    dataSource: DataSource,

    employeeId: string,

    roleCode: string,

    assignedBy?: string,

  ): Promise<void> {

    const roleRepo = dataSource.getRepository(RbacRole);

    const assignRepo = dataSource.getRepository(RbacEmployeeRoleAssignment);



    const role = await roleRepo.findOne({ where: { code: roleCode, isActive: true } });

    if (!role) {

      this.logger.warn(`RBAC role "${roleCode}" not found; run seedTenantRbac first`);

      return;

    }



    const existing = await assignRepo.findOne({

      where: { employeeId, isPrimary: true },

    });

    if (existing?.roleId === role.id) {

      return;

    }



    if (existing) {

      await assignRepo.delete({ employeeId, isPrimary: true });

    }



    await assignRepo.save(

      assignRepo.create({

        employeeId,

        roleId: role.id,

        isPrimary: true,

        effectiveFrom: new Date().toISOString().slice(0, 10),

        assignedBy,

      }),

    );

  }



  private async backfillEmployeeAssignments(

    dataSource: DataSource,

    roleByCode: Map<string, RbacRole>,

  ) {

    const employeeRepo = dataSource.getRepository(Employee);

    const accessRepo = dataSource.getRepository(EmployeeAccessControl);

    const assignRepo = dataSource.getRepository(RbacEmployeeRoleAssignment);



    const employees = await employeeRepo.find();

    for (const emp of employees) {

      const existing = await assignRepo.findOne({

        where: { employeeId: emp.id, isPrimary: true },

      });

      if (existing) continue;



      const access = await accessRepo

        .createQueryBuilder('ac')

        .where('ac.employeeId = :employeeId', { employeeId: emp.id })

        .getOne();



      let roleCode = employeeRoleToRoleCode(emp.role);

      if (access?.portalRoleLabel) {

        roleCode = portalRoleLabelToRoleCode(access.portalRoleLabel);

      }



      const role = roleByCode.get(roleCode) ?? roleByCode.get('EMPLOYEE');

      if (!role) continue;



      await assignRepo.save(

        assignRepo.create({

          employeeId: emp.id,

          roleId: role.id,

          isPrimary: true,

          effectiveFrom: new Date().toISOString().slice(0, 10),

        }),

      );

    }

  }

}


