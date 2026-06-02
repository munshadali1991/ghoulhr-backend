import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CalendarHolidayType } from '../../settings/entities/organization-calendar-holiday.entity';
import { OrganizationCalendarQueryService } from '../../settings/organization-calendar-query.service';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import { LeavePolicyService } from '../leave/leave-policy.service';
import {
  findEmployeeLeaveOverlappingRange,
  toDateKey,
} from '../leave/leave-request-query.util';
import {
  formatDayOfWeek,
  formatDateKey,
} from '../shared/ess-format.util';

@Injectable()
export class EssHolidaysService {
  constructor(
    private readonly policyService: LeavePolicyService,
    private readonly calendarQuery: OrganizationCalendarQueryService,
  ) {}

  async getHolidayCalendar(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
  ) {
    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const filtered = await this.calendarQuery.findPublishedHolidaysForYear(
      dataSource,
      { organizationId, year, locationId },
    );

    const restrictedDates = filtered
      .filter((h) => h.holidayType === CalendarHolidayType.RESTRICTED)
      .map((h) => h.holidayDate);

    const appliedDates = new Set<string>();
    if (restrictedDates.length > 0) {
      const rangeStart = restrictedDates.reduce((a, b) => (a < b ? a : b));
      const rangeEnd = restrictedDates.reduce((a, b) => (a > b ? a : b));
      const leaveRows = await findEmployeeLeaveOverlappingRange(dataSource, {
        organizationId,
        employeeId,
        rangeStart,
        rangeEnd,
      });
      for (const row of leaveRows) {
        const startDate = toDateKey(row.startDate);
        const endDate = toDateKey(row.endDate);
        for (const hDate of restrictedDates) {
          if (hDate >= startDate && hDate <= endDate) {
            appliedDates.add(hDate);
          }
        }
      }
    }

    /** @type {Record<number, object[]>} */
    const months: Record<number, object[]> = {};
    for (let m = 0; m < 12; m += 1) {
      months[m] = [];
    }

    for (const h of filtered) {
      const d = new Date(`${h.holidayDate}T12:00:00.000Z`);
      const monthIndex = d.getUTCMonth();
      let applicationStatus: 'none' | 'applied' | 'applicable' = 'none';
      if (h.holidayType === CalendarHolidayType.RESTRICTED) {
        applicationStatus = appliedDates.has(h.holidayDate)
          ? 'applied'
          : 'applicable';
      }
      months[monthIndex].push({
        date: h.holidayDate,
        name: h.name,
        dayOfWeek: formatDayOfWeek(h.holidayDate),
        applicationStatus,
      });
    }

    return { year, months };
  }

  async getUpcomingHolidays(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    limit = 4,
  ) {
    const today = formatDateKey(new Date());
    const year = new Date().getFullYear();
    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const [currentYearRows, nextYearRows] = await Promise.all([
      this.calendarQuery.findPublishedHolidaysForYear(dataSource, {
        organizationId,
        year,
        locationId,
      }),
      this.calendarQuery.findPublishedHolidaysForYear(dataSource, {
        organizationId,
        year: year + 1,
        locationId,
      }),
    ]);

    const restrictedInCombined = [...currentYearRows, ...nextYearRows].filter(
      (h) => h.holidayType === CalendarHolidayType.RESTRICTED,
    );
    const appliedDates = new Set<string>();
    if (restrictedInCombined.length > 0) {
      const rangeStart = restrictedInCombined.reduce((a, b) =>
        a.holidayDate < b.holidayDate ? a : b,
      ).holidayDate;
      const rangeEnd = restrictedInCombined.reduce((a, b) =>
        a.holidayDate > b.holidayDate ? a : b,
      ).holidayDate;
      const leaveRows = await findEmployeeLeaveOverlappingRange(dataSource, {
        organizationId,
        employeeId,
        rangeStart,
        rangeEnd,
      });
      for (const row of leaveRows) {
        const startDate = toDateKey(row.startDate);
        const endDate = toDateKey(row.endDate);
        for (const h of restrictedInCombined) {
          if (
            h.holidayDate >= startDate &&
            h.holidayDate <= endDate &&
            h.holidayDate >= today
          ) {
            appliedDates.add(h.holidayDate);
          }
        }
      }
    }

    const combined = [...currentYearRows, ...nextYearRows]
      .filter((h) => h.holidayDate >= today)
      .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
      .slice(0, limit);

    return combined.map((h) => ({
      date: h.holidayDate,
      name: h.name,
      dayOfWeek: formatDayOfWeek(h.holidayDate),
      applicationStatus:
        h.holidayType === CalendarHolidayType.RESTRICTED
          ? appliedDates.has(h.holidayDate)
            ? ('applied' as const)
            : ('applicable' as const)
          : ('none' as const),
    }));
  }
}
