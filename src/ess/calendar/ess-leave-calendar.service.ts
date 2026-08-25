import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  eachCalendarDayInRange,
  orgDateKeyForInstant,
  resolveOrgTimezone,
} from '../../common/utils/org-timezone.util';
import {
  Employee,
  EmployeeStatus,
} from '../../employees/employee.entity';
import { EmployeeEmploymentDetail } from '../../employees/entities/employee-employment-detail.entity';
import { LocationConfiguration } from '../../employees/entities/location-configuration.entity';
import { CalendarHolidayType } from '../../settings/entities/organization-calendar-holiday.entity';
import { OrganizationCalendarQueryService } from '../../settings/organization-calendar-query.service';
import { SettingsService } from '../../settings/settings.service';
import { AccessScope } from '../../rbac/constants/access-scope.enum';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import { LeavePolicyService } from '../leave/leave-policy.service';
import { resolveEmployeeLocationId } from '../leave/utils/leave-location.util';
import {
  findLeaveRequestsOverlappingRange,
  toDateKey,
} from '../leave/leave-request-query.util';
import { daysInMonth } from '../shared/ess-format.util';

export const TEAM_ON_LEAVE_PERMISSION = 'dashboard.ess.team-on-leave:read';

const CHART_MAX_RANGE_DAYS = 31;
const RESTRICTED_HOLIDAY_SERIES_KEY = 'restricted-holiday';
const RESTRICTED_HOLIDAY_LABEL = 'Restricted Holiday';

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface LeaveCalendarDayMarker {
  date: string;
  holiday?: 'general' | 'restricted';
  onLeave?: boolean;
  /** Unique people on leave that day (team or self filter). */
  onLeaveCount?: number;
}

export interface TeamOnLeavePerson {
  employeeId: string;
  name: string;
  employeeCode: string;
  initials: string;
}

export interface TeamOnLeaveMonthPerson extends TeamOnLeavePerson {
  days: number;
  dates: string[];
}

@Injectable()
export class EssLeaveCalendarService {
  constructor(
    private readonly policyService: LeavePolicyService,
    private readonly calendarQuery: OrganizationCalendarQueryService,
    private readonly settingsService: SettingsService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
  ) {}

  async getCalendar(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number | undefined,
    month: number | undefined,
    filter: 'me' | 'team',
  ) {
    const profile = await this.settingsService.getOrgProfile(dataSource);
    const timezone = resolveOrgTimezone(profile.timezone);
    const todayKey = orgDateKeyForInstant(new Date(), timezone);
    const [yStr, mStr] = todayKey.split('-');
    const resolvedYear = year ?? Number(yStr);
    const resolvedMonth = month ?? Number(mStr);

    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const monthPad = String(resolvedMonth).padStart(2, '0');
    const lastDay = daysInMonth(resolvedYear, resolvedMonth);
    const rangeStart = `${resolvedYear}-${monthPad}-01`;
    const rangeEnd = `${resolvedYear}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

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

    const employeeIds = await this.resolveCalendarEmployeeIds(
      dataSource,
      organizationId,
      employeeId,
      filter,
    );

    const teamOnLeaveIds = new Set<string>();
    /** Unique employee IDs on leave per calendar day */
    const onLeaveByDate = new Map<string, Set<string>>();

    if (employeeIds === null || employeeIds.length > 0) {
      const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
        organizationId,
        employeeIds,
        rangeStart,
        rangeEnd,
        statuses: [LeaveRequestStatus.APPROVED],
      });

      for (const row of leaveRows) {
        if (filter === 'team' && row.employeeId === employeeId) continue;

        const start = toDateKey(row.startDate);
        const end = toDateKey(row.endDate);
        teamOnLeaveIds.add(row.employeeId);

        const overlapStart = start < rangeStart ? rangeStart : start;
        const overlapEnd = end > rangeEnd ? rangeEnd : end;

        for (const key of eachCalendarDayInRange(overlapStart, overlapEnd)) {
          let daySet = onLeaveByDate.get(key);
          if (!daySet) {
            daySet = new Set();
            onLeaveByDate.set(key, daySet);
          }
          daySet.add(row.employeeId);
        }
      }
    }

    for (const [key, idSet] of onLeaveByDate) {
      const count = idSet.size;
      if (!days[key]) {
        days[key] = { date: key, onLeave: true, onLeaveCount: count };
      } else {
        days[key].onLeave = true;
        days[key].onLeaveCount = count;
      }
    }

    return {
      year: resolvedYear,
      month: resolvedMonth,
      filter,
      timezone,
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
    const employeeIds = await this.resolveCalendarEmployeeIds(
      dataSource,
      organizationId,
      employeeId,
      filter,
    );

    if (employeeIds !== null && employeeIds.length === 0) {
      return { date, filter, items: [], holidays: [] };
    }

    const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
      organizationId,
      employeeIds,
      rangeStart: date,
      rangeEnd: date,
      statuses: [LeaveRequestStatus.APPROVED],
      relations: ['employee', 'leaveConfiguration'],
    });

    const empIdsForMeta = [
      ...new Set(
        leaveRows
          .filter((r) => !(filter === 'team' && r.employeeId === employeeId))
          .map((r) => r.employeeId),
      ),
    ];

    const employeesWithDesignation =
      empIdsForMeta.length > 0
        ? await dataSource.getRepository(Employee).find({
            where: { id: In(empIdsForMeta) },
            relations: ['designationRef'],
          })
        : [];
    const designationByEmployeeId = new Map(
      employeesWithDesignation.map((e) => [
        e.id,
        e.designationRef?.name ?? null,
      ]),
    );

    const locationByEmployeeId = await this.resolveLocationsForEmployees(
      dataSource,
      organizationId,
      empIdsForMeta,
    );

    const q = String(search ?? '').trim().toLowerCase();
    const items = [];
    for (const row of leaveRows) {
      if (filter === 'team' && row.employeeId === employeeId) continue;

      const start = toDateKey(row.startDate);
      const end = toDateKey(row.endDate);
      if (date < start || date > end) continue;

      const name = row.employee?.name ?? 'Employee';
      const employeeCode = row.employee?.employeeCode ?? '';
      if (
        q &&
        !name.toLowerCase().includes(q) &&
        !employeeCode.toLowerCase().includes(q)
      ) {
        continue;
      }

      items.push({
        id: row.id,
        employeeId: row.employeeId,
        employeeName: name,
        employeeCode,
        designation: designationByEmployeeId.get(row.employeeId) ?? null,
        location: locationByEmployeeId.get(row.employeeId) ?? null,
        leaveType: row.leaveConfiguration?.name ?? 'Leave',
        days: Number(row.daysCount),
        from: start,
        to: end,
        durationLabel: durationLabelFromSessions(
          row.startSession,
          row.endSession,
          start,
          end,
        ),
      });
    }

    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const holidays = await this.getHolidaysForDate(
      dataSource,
      organizationId,
      date,
      locationId,
    );

    return { date, filter, items, holidays };
  }

  private async resolveLocationsForEmployees(
    dataSource: DataSource,
    organizationId: string,
    employeeIds: string[],
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (employeeIds.length === 0) return result;

    const employments = await dataSource
      .getRepository(EmployeeEmploymentDetail)
      .createQueryBuilder('ed')
      .leftJoinAndSelect('ed.employee', 'employee')
      .where('employee.id IN (:...ids)', { ids: employeeIds })
      .getMany();

    const locationIds = new Set<string>();
    const locIdByEmp = new Map<string, string | null>();
    for (const id of employeeIds) {
      locIdByEmp.set(id, null);
    }
    for (const ed of employments) {
      const empId = ed.employee?.id;
      if (!empId) continue;
      const locationId = await resolveEmployeeLocationId(
        dataSource,
        organizationId,
        ed.businessUnit,
      );
      locIdByEmp.set(empId, locationId);
      if (locationId) locationIds.add(locationId);
    }

    const locations =
      locationIds.size > 0
        ? await dataSource.getRepository(LocationConfiguration).find({
            where: { id: In([...locationIds]) },
          })
        : [];
    const nameById = new Map(locations.map((l) => [l.id, l.name ?? null]));

    for (const [empId, locId] of locIdByEmp) {
      const fromLoc = locId ? nameById.get(locId) ?? null : null;
      const employment = employments.find((e) => e.employee?.id === empId);
      result.set(empId, fromLoc ?? employment?.workLocation ?? null);
    }
    return result;
  }

  private async getHolidaysForDate(
    dataSource: DataSource,
    organizationId: string,
    date: string,
    locationId?: string | null,
  ) {
    const holidays = await this.calendarQuery.findPublishedHolidaysInRange(
      dataSource,
      {
        organizationId,
        fromDate: date,
        toDate: date,
        locationId: locationId ?? null,
      },
    );

    const locationIds = [
      ...new Set(
        holidays
          .map((h) => h.locationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const locations =
      locationIds.length > 0
        ? await dataSource.getRepository(LocationConfiguration).find({
            where: { id: In(locationIds) },
          })
        : [];
    const nameById = new Map(locations.map((l) => [l.id, l.name ?? '']));

    return holidays.map((h) => ({
      id: h.id,
      name: h.name,
      holidayType:
        h.holidayType === CalendarHolidayType.RESTRICTED
          ? 'Restricted Holiday'
          : 'General Holiday',
      locationLabel: h.locationId
        ? nameById.get(h.locationId) || '—'
        : 'All locations',
    }));
  }

  /**
   * People in RBAC access scope with APPROVED leave: today + this month.
   * SELF scope yields empty lists; actor is never included in the roster.
   */
  async getTeamOnLeave(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
  ) {
    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const scope =
      auth.permissionScopes.get(TEAM_ON_LEAVE_PERMISSION) ?? AccessScope.SELF;

    if (scope === AccessScope.SELF) {
      const profile = await this.settingsService.getOrgProfile(dataSource);
      const timezone = resolveOrgTimezone(profile.timezone);
      return { hasTeam: true, today: [], thisMonth: [], timezone };
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      TEAM_ON_LEAVE_PERMISSION,
      auth,
    );

    /** null = full organization; otherwise scoped IDs excluding the viewer */
    const employeeIds: string[] | null =
      visibleIds === null
        ? null
        : visibleIds.filter((id) => id !== actorEmployeeId);

    const profile = await this.settingsService.getOrgProfile(dataSource);
    const timezone = resolveOrgTimezone(profile.timezone);

    if (employeeIds !== null && employeeIds.length === 0) {
      return { hasTeam: true, today: [], thisMonth: [], timezone };
    }

    const today = orgDateKeyForInstant(new Date(), timezone);
    const [yearStr, monthStr] = today.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthPad = String(month).padStart(2, '0');
    const lastDay = daysInMonth(year, month);
    const rangeStart = `${year}-${monthPad}-01`;
    const rangeEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

    const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
      organizationId,
      employeeIds,
      rangeStart,
      rangeEnd,
      statuses: [LeaveRequestStatus.APPROVED],
      relations: ['employee'],
    });

    const todayByEmployee = new Map<string, TeamOnLeavePerson>();
    const monthByEmployee = new Map<
      string,
      TeamOnLeaveMonthPerson & { dateSet: Set<string> }
    >();

    for (const row of leaveRows) {
      if (row.employeeId === actorEmployeeId) continue;

      const start = toDateKey(row.startDate);
      const end = toDateKey(row.endDate);
      const name = row.employee?.name ?? 'Employee';
      const employeeCode = row.employee?.employeeCode ?? '';
      const initials = nameInitials(name);
      const personBase: TeamOnLeavePerson = {
        employeeId: row.employeeId,
        name,
        employeeCode,
        initials,
      };

      if (today >= start && today <= end) {
        todayByEmployee.set(row.employeeId, personBase);
      }

      const overlapStart = start < rangeStart ? rangeStart : start;
      const overlapEnd = end > rangeEnd ? rangeEnd : end;
      if (overlapStart > overlapEnd) continue;

      let monthEntry = monthByEmployee.get(row.employeeId);
      if (!monthEntry) {
        monthEntry = {
          ...personBase,
          days: 0,
          dates: [],
          dateSet: new Set<string>(),
        };
        monthByEmployee.set(row.employeeId, monthEntry);
      }

      for (const key of eachCalendarDayInRange(overlapStart, overlapEnd)) {
        monthEntry.dateSet.add(key);
      }
    }

    const todayList = Array.from(todayByEmployee.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const thisMonth = Array.from(monthByEmployee.values())
      .map(({ dateSet, ...rest }) => {
        const dates = Array.from(dateSet).sort();
        return {
          ...rest,
          days: dates.length,
          dates,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      hasTeam: true,
      today: todayList,
      thisMonth,
      timezone,
    };
  }

  /**
   * Day-series chart + breakdown for Team On Leave screen.
   */
  async getTeamOnLeaveChart(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    params: {
      from: string;
      to: string;
      type?: 'leave' | 'holiday' | 'all';
    },
  ) {
    this.assertChartDateRange(params.from, params.to);
    const chartType = params.type ?? 'all';
    const includeLeave = chartType === 'leave' || chartType === 'all';
    const includeHoliday = chartType === 'holiday' || chartType === 'all';

    const empty = emptyTeamOnLeaveChart(params.from, params.to, chartType);

    const profile = await this.settingsService.getOrgProfile(dataSource);
    const timezone = resolveOrgTimezone(profile.timezone);

    const scopedIds = await this.resolveTeamOnLeaveEmployeeIds(
      dataSource,
      organizationId,
      actorEmployeeId,
    );
    if (scopedIds === 'empty') {
      return { ...empty, timezone };
    }

    const employeeIds: string[] | null = scopedIds;
    const rangeDays = eachCalendarDayInRange(params.from, params.to);

    const seriesMap = new Map<
      string,
      { key: string; label: string; kind: 'leave' | 'holiday' }
    >();
    const valuesByDate = new Map<string, Record<string, number>>();
    for (const d of rangeDays) {
      valuesByDate.set(d, {});
    }

    type LeaveBreakdown = {
      employeeId: string;
      name: string;
      employeeCode: string;
      leaveType: string;
      from: string;
      to: string;
      days: number;
    };
    type HolidayBreakdown = {
      employeeId: string;
      name: string;
      employeeCode: string;
      holidayName: string;
      holidayType: string;
    };

    const breakdownByDate: Record<
      string,
      { leave: LeaveBreakdown[]; holiday: HolidayBreakdown[] }
    > = {};
    for (const d of rangeDays) {
      breakdownByDate[d] = { leave: [], holiday: [] };
    }

    const listRows: Array<{
      date: string;
      employeeId: string;
      name: string;
      employeeCode: string;
      kind: 'leave' | 'holiday';
      typeLabel: string;
      from: string;
      to: string;
      days: number;
    }> = [];

    if (includeLeave) {
      const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
        organizationId,
        employeeIds,
        rangeStart: params.from,
        rangeEnd: params.to,
        statuses: [LeaveRequestStatus.APPROVED],
        relations: ['employee', 'leaveConfiguration'],
      });

      for (const row of leaveRows) {
        if (row.employeeId === actorEmployeeId) continue;

        const start = toDateKey(row.startDate);
        const end = toDateKey(row.endDate);
        const overlapStart = start < params.from ? params.from : start;
        const overlapEnd = end > params.to ? params.to : end;
        if (overlapStart > overlapEnd) continue;

        const leaveType = row.leaveConfiguration?.name ?? 'Leave';
        const seriesKey = leaveSeriesKey(leaveType);
        if (!seriesMap.has(seriesKey)) {
          seriesMap.set(seriesKey, {
            key: seriesKey,
            label: leaveType,
            kind: 'leave',
          });
        }

        const calendarDays = eachCalendarDayInRange(start, end);
        const totalDays = Number(row.daysCount);
        const dayWeight =
          Number.isFinite(totalDays) &&
          totalDays > 0 &&
          calendarDays.length > 0
            ? totalDays / calendarDays.length
            : 1;

        const name = row.employee?.name ?? 'Employee';
        const employeeCode = row.employee?.employeeCode ?? '';
        const daysNum = Number.isFinite(totalDays) ? totalDays : calendarDays.length;

        for (const day of eachCalendarDayInRange(overlapStart, overlapEnd)) {
          const bucket = valuesByDate.get(day);
          if (!bucket) continue;
          bucket[seriesKey] = roundChart((bucket[seriesKey] ?? 0) + dayWeight);

          breakdownByDate[day].leave.push({
            employeeId: row.employeeId,
            name,
            employeeCode,
            leaveType,
            from: start,
            to: end,
            days: daysNum,
          });

          listRows.push({
            date: day,
            employeeId: row.employeeId,
            name,
            employeeCode,
            kind: 'leave',
            typeLabel: leaveType,
            from: start,
            to: end,
            days: daysNum,
          });
        }
      }
    }

    if (includeHoliday) {
      const employees = await this.loadScopedActiveEmployees(
        dataSource,
        employeeIds,
        actorEmployeeId,
      );

      const employments =
        employees.length > 0
          ? await dataSource
              .getRepository(EmployeeEmploymentDetail)
              .createQueryBuilder('ed')
              .leftJoinAndSelect('ed.employee', 'employee')
              .where('employee.id IN (:...ids)', {
                ids: employees.map((e) => e.id),
              })
              .getMany()
          : [];
      const employmentByEmployeeId = new Map(
        employments.map((row) => [row.employee?.id ?? '', row]),
      );

      const locationByEmployeeId = new Map<string, string | null>();
      for (const emp of employees) {
        const employment = employmentByEmployeeId.get(emp.id);
        const locationId = await resolveEmployeeLocationId(
          dataSource,
          organizationId,
          employment?.businessUnit,
        );
        locationByEmployeeId.set(emp.id, locationId);
      }

      const holidays = await this.calendarQuery.findPublishedHolidaysInRange(
        dataSource,
        {
          organizationId,
          fromDate: params.from,
          toDate: params.to,
          locationId: null,
        },
      );

      const restricted = holidays.filter(
        (h) => h.holidayType === CalendarHolidayType.RESTRICTED,
      );

      if (restricted.length > 0) {
        seriesMap.set(RESTRICTED_HOLIDAY_SERIES_KEY, {
          key: RESTRICTED_HOLIDAY_SERIES_KEY,
          label: RESTRICTED_HOLIDAY_LABEL,
          kind: 'holiday',
        });
      }

      for (const h of restricted) {
        const day = h.holidayDate;
        if (!valuesByDate.has(day)) continue;

        for (const emp of employees) {
          const locationId = locationByEmployeeId.get(emp.id) ?? null;
          if (!this.calendarQuery.appliesToLocation(h, locationId)) continue;

          const bucket = valuesByDate.get(day)!;
          bucket[RESTRICTED_HOLIDAY_SERIES_KEY] = roundChart(
            (bucket[RESTRICTED_HOLIDAY_SERIES_KEY] ?? 0) + 1,
          );

          const name = emp.name ?? 'Employee';
          const employeeCode = emp.employeeCode ?? '';
          breakdownByDate[day].holiday.push({
            employeeId: emp.id,
            name,
            employeeCode,
            holidayName: h.name,
            holidayType: 'RESTRICTED',
          });

          listRows.push({
            date: day,
            employeeId: emp.id,
            name,
            employeeCode,
            kind: 'holiday',
            typeLabel: h.name || RESTRICTED_HOLIDAY_LABEL,
            from: day,
            to: day,
            days: 1,
          });
        }
      }
    }

    const series = Array.from(seriesMap.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'holiday' ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

    const points = rangeDays.map((date) => {
      const values = valuesByDate.get(date) ?? {};
      const [, m, d] = date.split('-').map(Number);
      return {
        date,
        label: `${d} ${MONTH_SHORT[(m ?? 1) - 1]}`,
        values,
      };
    });

    return {
      from: params.from,
      to: params.to,
      type: chartType,
      timezone,
      series,
      points,
      breakdownByDate,
      listRows: listRows.sort(
        (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
      ),
    };
  }

  async exportTeamOnLeaveChartCsv(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    params: {
      from: string;
      to: string;
      type?: 'leave' | 'holiday' | 'all';
    },
  ): Promise<{ filename: string; csv: string }> {
    const chart = await this.getTeamOnLeaveChart(
      dataSource,
      organizationId,
      actorEmployeeId,
      params,
    );

    const header = [
      'Date',
      'Employee Name',
      'Employee Code',
      'Kind',
      'Type',
      'From',
      'To',
      'Days',
    ];
    const lines = [header.join(',')];
    for (const row of chart.listRows) {
      lines.push(
        [
          csvEscape(row.date),
          csvEscape(row.name),
          csvEscape(row.employeeCode),
          csvEscape(row.kind),
          csvEscape(row.typeLabel),
          csvEscape(row.from),
          csvEscape(row.to),
          csvEscape(String(row.days)),
        ].join(','),
      );
    }

    return {
      filename: `team-on-leave-${params.from}-to-${params.to}.csv`,
      csv: lines.join('\n'),
    };
  }

  private assertChartDateRange(from: string, to: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    if (to < from) {
      throw new BadRequestException('to must be on or after from');
    }
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    const days =
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > CHART_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${CHART_MAX_RANGE_DAYS} days`,
      );
    }
  }

  /**
   * @returns null = org-wide; string[] = scoped; 'empty' = no roster
   */
  private async resolveTeamOnLeaveEmployeeIds(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
  ): Promise<string[] | null | 'empty'> {
    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const scope =
      auth.permissionScopes.get(TEAM_ON_LEAVE_PERMISSION) ?? AccessScope.SELF;

    if (scope === AccessScope.SELF) {
      return 'empty';
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      TEAM_ON_LEAVE_PERMISSION,
      auth,
    );

    if (visibleIds === null) {
      return null;
    }

    const filtered = visibleIds.filter((id) => id !== actorEmployeeId);
    return filtered.length === 0 ? 'empty' : filtered;
  }

  private async loadScopedActiveEmployees(
    dataSource: DataSource,
    employeeIds: string[] | null,
    actorEmployeeId: string,
  ): Promise<Employee[]> {
    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.status = :status', { status: EmployeeStatus.ACTIVE })
      .andWhere('e.id != :actorId', { actorId: actorEmployeeId });

    if (employeeIds !== null) {
      if (employeeIds.length === 0) return [];
      qb.andWhere('e.id IN (:...employeeIds)', { employeeIds });
    }

    return qb.orderBy('e.name', 'ASC').getMany();
  }

  /**
   * Me = self only. Team = same RBAC roster as Team On Leave
   * (null = org-wide, [] = empty, string[] = scoped peers).
   */
  private async resolveCalendarEmployeeIds(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    filter: 'me' | 'team',
  ): Promise<string[] | null> {
    if (filter === 'me') return [employeeId];

    const scoped = await this.resolveTeamOnLeaveEmployeeIds(
      dataSource,
      organizationId,
      employeeId,
    );
    if (scoped === 'empty') return [];
    return scoped;
  }
}

function nameInitials(name: string): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function emptyTeamOnLeaveChart(
  from: string,
  to: string,
  type: 'leave' | 'holiday' | 'all' = 'all',
) {
  const rangeDays = eachCalendarDayInRange(from, to);
  return {
    from,
    to,
    type,
    series: [] as Array<{ key: string; label: string; kind: 'leave' | 'holiday' }>,
    points: rangeDays.map((date) => {
      const [, m, d] = date.split('-').map(Number);
      return {
        date,
        label: `${d} ${MONTH_SHORT[(m ?? 1) - 1]}`,
        values: {} as Record<string, number>,
      };
    }),
    breakdownByDate: Object.fromEntries(
      rangeDays.map((d) => [d, { leave: [], holiday: [] }]),
    ) as Record<string, { leave: unknown[]; holiday: unknown[] }>,
    listRows: [] as Array<{
      date: string;
      employeeId: string;
      name: string;
      employeeCode: string;
      kind: 'leave' | 'holiday';
      typeLabel: string;
      from: string;
      to: string;
      days: number;
    }>,
  };
}

function leaveSeriesKey(leaveType: string): string {
  return `leave:${String(leaveType)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function roundChart(n: number): number {
  return Math.round(n * 100) / 100;
}

function durationLabelFromSessions(
  startSession: string | null | undefined,
  endSession: string | null | undefined,
  from: string,
  to: string,
): string {
  const start = String(startSession ?? '').trim();
  const end = String(endSession ?? '').trim();
  if (!start && !end) return 'Full Day';
  if (from === to) {
    if (start && end && start === end) {
      if (/session\s*1/i.test(start)) return 'First Half';
      if (/session\s*2/i.test(start)) return 'Second Half';
      return start;
    }
    if (
      (/session\s*1/i.test(start) && /session\s*2/i.test(end)) ||
      (start && end && start !== end)
    ) {
      return 'Full Day';
    }
  }
  return 'Full Day';
}

function csvEscape(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
