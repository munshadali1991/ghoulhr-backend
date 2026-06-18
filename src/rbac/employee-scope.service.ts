import { Injectable } from '@nestjs/common';

import { DataSource } from 'typeorm';

import { EmployeeReportingManager } from '../employees/entities/employee-reporting-manager.entity';

import { AccessScope } from './constants/access-scope.enum';

import { AccessScopeResolver } from './access-scope.resolver';

import { RbacConfigService } from './rbac-config.service';

import type { ResolvedAuthorization } from './authorization.service';



const FULL_ROSTER_ROLES = new Set(['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN']);



@Injectable()

export class EmployeeScopeService {

  constructor(

    private readonly accessScopeResolver: AccessScopeResolver,

    private readonly rbacConfig: RbacConfigService,

  ) {}



  /**

   * Resolve visible employee IDs for a permission.

   * Uses access-scope model when RBAC_SCOPE_V2 is enabled; otherwise legacy role-code logic.

   */

  async getVisibleEmployeeIds(

    dataSource: DataSource,

    actorEmployeeId: string,

    permissionCode: string,

    resolved: ResolvedAuthorization,

  ): Promise<string[] | null> {

    if (this.rbacConfig.isScopeV2Enabled()) {

      const scope =

        resolved.permissionScopes.get(permissionCode) ?? AccessScope.SELF;

      return this.accessScopeResolver.resolveVisibleEmployeeIds(

        dataSource,

        actorEmployeeId,

        scope,

      );

    }



    return this.getVisibleEmployeeIdsLegacy(

      dataSource,

      actorEmployeeId,

      resolved.roleCodes,

    );

  }



  /** @deprecated Use getVisibleEmployeeIds with permission code when RBAC_SCOPE_V2 is enabled. */

  async getVisibleEmployeeIdsLegacy(

    dataSource: DataSource,

    actorEmployeeId: string,

    roleCodes: string[],

  ): Promise<string[] | null> {

    if (roleCodes.some((r) => FULL_ROSTER_ROLES.has(r))) {

      return null;

    }



    if (!roleCodes.some((r) => r === 'MANAGER' || r === 'TEAM_LEAD')) {

      return [actorEmployeeId];

    }



    const reportRows = await dataSource

      .getRepository(EmployeeReportingManager)

      .createQueryBuilder('rm')

      .where('rm.managerEmployeeId = :managerId', { managerId: actorEmployeeId })

      .andWhere('(rm.effectiveTo IS NULL OR rm.effectiveTo >= CURRENT_DATE)')

      .andWhere('rm.effectiveFrom <= CURRENT_DATE')

      .getMany();



    const ids = new Set<string>([actorEmployeeId]);

    for (const row of reportRows) {

      ids.add(row.employeeId);

    }

    return [...ids];

  }

}

