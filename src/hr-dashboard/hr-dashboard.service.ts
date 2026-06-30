import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Department } from '../employees/entities/department.entity';
import { EmployeeAuditLog } from '../employees/entities/employee-audit-log.entity';
import {
  AttendanceDailySummary,
  AttendanceDayStatus,
} from '../ess/entities/attendance-daily-summary.entity';
import { OrganizationSetting } from '../settings/entities/organization-setting.entity';
import { SETTING_KEYS } from '../settings/settings.constants';
import { orgDateKeyForInstant, resolveOrgTimezone } from '../common/utils/org-timezone.util';
import { AuthorizationService } from '../rbac/authorization.service';
import { EmployeeScopeService } from '../rbac/employee-scope.service';

export interface HrDashboardStats {
  totalEmployees?: number;
  presentToday?: number;
  pendingPayroll?: number;
  activeDepartments?: number;
}

export interface HrDashboardActivityItem {
  id: string;
  action: string;
  message: string;
  actorName: string;
  createdAt: string;
}

export interface HrDashboardResponse {
  stats: HrDashboardStats;
  recentActivity?: HrDashboardActivityItem[];
}

@Injectable()
export class HrDashboardService {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
  ) {}

  async getDashboard(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    cacheKey: object,
  ): Promise<HrDashboardResponse> {
    const authContext = {
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    };

    const resolved = await this.authorizationService.resolveCached(
      cacheKey,
      authContext,
    );

    const stats: HrDashboardStats = {};

    const canReadEmployees = resolved.permissions.includes('employees:read');
    const canReadPayroll = resolved.permissions.includes('payroll:read');
    const canReadDepartments =
      resolved.permissions.includes('settings.departments:read') ||
      resolved.permissions.includes('settings.organization:read') ||
      resolved.permissions.includes('settings.employees:read');

    if (canReadEmployees) {
      const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
        dataSource,
        actorEmployeeId,
        'employees:read',
        resolved,
      );

      stats.totalEmployees = await this.countRosterEmployees(
        dataSource,
        visibleIds,
      );

      const timezone = await this.loadOrgTimezone(dataSource);
      const workDate = orgDateKeyForInstant(new Date(), timezone);

      stats.presentToday = await this.countPresentToday(
        dataSource,
        organizationId,
        workDate,
        visibleIds,
      );
    }

    if (canReadPayroll) {
      stats.pendingPayroll = 0;
    }

    if (canReadDepartments) {
      stats.activeDepartments = await dataSource.getRepository(Department).count({
        where: { organizationId, isActive: true },
      });
    }

    const response: HrDashboardResponse = { stats };

    if (canReadEmployees) {
      response.recentActivity = await this.loadRecentActivity(
        dataSource,
        actorEmployeeId,
        resolved,
      );
    }

    return response;
  }

  private async countRosterEmployees(
    dataSource: DataSource,
    visibleIds: string[] | null,
  ): Promise<number> {
    if (Array.isArray(visibleIds) && visibleIds.length === 0) {
      return 0;
    }

    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.status != :terminated', {
        terminated: EmployeeStatus.TERMINATED,
      });

    if (Array.isArray(visibleIds)) {
      qb.andWhere('e.id IN (:...visibleIds)', { visibleIds });
    }

    return qb.getCount();
  }

  private async countPresentToday(
    dataSource: DataSource,
    organizationId: string,
    workDate: string,
    visibleIds: string[] | null,
  ): Promise<number> {
    if (Array.isArray(visibleIds) && visibleIds.length === 0) {
      return 0;
    }

    const qb = dataSource
      .getRepository(AttendanceDailySummary)
      .createQueryBuilder('s')
      .where('s.organizationId = :organizationId', { organizationId })
      .andWhere('s.workDate = :workDate', { workDate })
      .andWhere('s.status = :status', { status: AttendanceDayStatus.P });

    if (Array.isArray(visibleIds)) {
      qb.andWhere('s.employeeId IN (:...visibleIds)', { visibleIds });
    }

    return qb.getCount();
  }

  private async loadOrgTimezone(dataSource: DataSource): Promise<string> {
    const row = await dataSource.getRepository(OrganizationSetting).findOne({
      where: { key: SETTING_KEYS.ORG_TIMEZONE },
    });
    const value =
      row?.value != null && typeof row.value === 'string'
        ? row.value
        : null;
    return resolveOrgTimezone(value);
  }

  private async loadRecentActivity(
    dataSource: DataSource,
    actorEmployeeId: string,
    resolved: Awaited<ReturnType<AuthorizationService['resolve']>>,
  ): Promise<HrDashboardActivityItem[]> {
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      'employees:read',
      resolved,
    );

    if (Array.isArray(visibleIds) && visibleIds.length === 0) {
      return [];
    }

    const qb = dataSource
      .getRepository(EmployeeAuditLog)
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.employee', 'employee')
      .orderBy('log.createdAt', 'DESC')
      .take(10);

    if (Array.isArray(visibleIds)) {
      qb.andWhere('employee.id IN (:...visibleIds)', { visibleIds });
    }

    const logs = await qb.getMany();
    if (logs.length === 0) {
      return [];
    }

    const actorIds = [...new Set(logs.map((log) => log.actorId))];
    const actors = await dataSource.getRepository(Employee).find({
      where: { id: In(actorIds) },
      select: ['id', 'name'],
    });
    const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      message: this.formatActivityMessage(log),
      actorName: actorNameById.get(log.actorId) ?? 'Unknown',
      createdAt: log.createdAt.toISOString(),
    }));
  }

  private formatActivityMessage(log: EmployeeAuditLog): string {
    const employeeName = log.employee?.name ?? 'Employee';
    switch (log.action) {
      case 'HR_ONBOARDING_CREATE':
        return `Onboarded ${employeeName}`;
      case 'HR_ONBOARDING_UPDATE':
        return `Updated ${employeeName}`;
      default:
        return `${log.action.replace(/_/g, ' ').toLowerCase()} — ${employeeName}`;
    }
  }
}
