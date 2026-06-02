import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { eachCalendarDayInRange } from '../../common/utils/org-timezone.util';
import {
  EmployeeReportingManager,
  REPORTING_MANAGER_TYPE_PRIMARY,
} from '../../employees/entities/employee-reporting-manager.entity';
import { CalendarHolidayType } from '../../settings/entities/organization-calendar-holiday.entity';
import { OrganizationCalendarQueryService } from '../../settings/organization-calendar-query.service';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import { LeavePolicyService } from '../leave/leave-policy.service';
import {
  findLeaveRequestsOverlappingRange,
  toDateKey,
} from '../leave/leave-request-query.util';
import { daysInMonth } from '../shared/ess-format.util';

export interface LeaveCalendarDayMarker {
  date: string;
  holiday?: 'general' | 'restricted';
  onLeave?: boolean;
}

@Injectable()
export class EssLeaveCalendarService {
  constructor(
    private readonly policyService: LeavePolicyService,
    private readonly calendarQuery: OrganizationCalendarQueryService,
  ) {}

  async getCalendar(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
    month: number,
    filter: 'me' | 'team',
  ) {
    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const monthPad = String(month).padStart(2, '0');
    const lastDay = daysInMonth(year, month);
    const rangeStart = `${year}-${monthPad}-01`;
    const rangeEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

    const holidayFiltered =
      await this.calendarQuery.findPublishedHolidaysInRange(dataSource, {
        organizationId,
        fromDate: rangeStart,
        toDate: rangeEnd,
        locationId,
      });

    const days: Record<string, LeaveCalendarDayMarker> = {};

    for (const h of holidayFiltered) {
      days[h.holidayDate] = {
        date: h.holidayDate,
        holiday:
          h.holidayType === CalendarHolidayType.RESTRICTED
            ? 'restricted'
            : 'general',
      };
    }

    const employeeIds =
      filter === 'team'
        ? await this.getTeamMemberIds(dataSource, employeeId)
        : [employeeId];

    const teamOnLeaveIds = new Set<string>();

    if (employeeIds.length > 0) {
      const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
        organizationId,
        employeeIds,
        rangeStart,
        rangeEnd,
        statuses: [
          LeaveRequestStatus.PENDING,
          LeaveRequestStatus.APPROVED,
        ],
      });

      for (const row of leaveRows) {
        const start = toDateKey(row.startDate);
        const end = toDateKey(row.endDate);
        teamOnLeaveIds.add(row.employeeId);

        const overlapStart = start < rangeStart ? rangeStart : start;
        const overlapEnd = end > rangeEnd ? rangeEnd : end;

        for (const key of eachCalendarDayInRange(overlapStart, overlapEnd)) {
          if (!days[key]) {
            days[key] = { date: key, onLeave: true };
          } else {
            days[key].onLeave = true;
          }
        }
      }
    }

    return {
      year,
      month,
      filter,
      days,
      teamOnLeaveCount: filter === 'team' ? teamOnLeaveIds.size : 0,
    };
  }

  async getTransactions(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    date: string,
    filter: 'me' | 'team',
    search?: string,
  ) {
    const employeeIds =
      filter === 'team'
        ? await this.getTeamMemberIds(dataSource, employeeId)
        : [employeeId];

    if (employeeIds.length === 0) {
      return { date, filter, items: [] };
    }

    const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
      organizationId,
      employeeIds,
      rangeStart: date,
      rangeEnd: date,
      relations: ['employee', 'leaveConfiguration'],
    });

    const items = [];
    for (const row of leaveRows) {
      const start = toDateKey(row.startDate);
      const end = toDateKey(row.endDate);
      if (date < start || date > end) continue;

      const name = row.employee?.name ?? 'Employee';
      if (
        search?.trim() &&
        !name.toLowerCase().includes(search.trim().toLowerCase())
      ) {
        continue;
      }

      items.push({
        employeeName: name,
        days: Number(row.daysCount),
        from: start,
        to: end,
      });
    }

    return { date, filter, items };
  }

  private async getTeamMemberIds(
    dataSource: DataSource,
    managerEmployeeId: string,
  ): Promise<string[]> {
    const reports = await dataSource
      .getRepository(EmployeeReportingManager)
      .find({
        where: {
          managerEmployeeId,
          managerType: REPORTING_MANAGER_TYPE_PRIMARY,
          effectiveTo: IsNull(),
        },
      });

    const ids = reports
      .map((r) => r.employeeId)
      .filter((id): id is string => Boolean(id));

    return [managerEmployeeId, ...ids];
  }
}
