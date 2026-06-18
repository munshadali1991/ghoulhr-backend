import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EmployeeReportingManager } from '../employees/entities/employee-reporting-manager.entity';
import { AccessScope } from './constants/access-scope.enum';

@Injectable()
export class AccessScopeResolver {
  /**
   * Resolve visible employee IDs for a permission scope.
   * @returns null when no filter (full organization roster).
   */
  async resolveVisibleEmployeeIds(
    dataSource: DataSource,
    actorEmployeeId: string,
    scope: AccessScope,
  ): Promise<string[] | null> {
    switch (scope) {
      case AccessScope.GLOBAL:
      case AccessScope.ORGANIZATION:
        return null;

      case AccessScope.DEPARTMENT:
        return this.resolveDepartmentScope(dataSource, actorEmployeeId);

      case AccessScope.TEAM:
        return this.resolveTeamScope(dataSource, actorEmployeeId);

      case AccessScope.SELF:
      default:
        return [actorEmployeeId];
    }
  }

  async canAccessEmployee(
    dataSource: DataSource,
    actorEmployeeId: string,
    targetEmployeeId: string,
    scope: AccessScope,
  ): Promise<boolean> {
    const visible = await this.resolveVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      scope,
    );
    if (visible === null) return true;
    return visible.includes(targetEmployeeId);
  }

  private async resolveDepartmentScope(
    dataSource: DataSource,
    actorEmployeeId: string,
  ): Promise<string[]> {
    const actor = await dataSource.getRepository(Employee).findOne({
      where: { id: actorEmployeeId },
      select: ['id', 'departmentId'],
    });
    if (!actor?.departmentId) {
      return [actorEmployeeId];
    }

    const peers = await dataSource.getRepository(Employee).find({
      where: { departmentId: actor.departmentId },
      select: ['id'],
    });
    return peers.map((e) => e.id);
  }

  private async resolveTeamScope(
    dataSource: DataSource,
    actorEmployeeId: string,
  ): Promise<string[]> {
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
