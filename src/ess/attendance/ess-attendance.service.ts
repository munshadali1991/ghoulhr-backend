import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Between, DataSource, EntityManager, In } from 'typeorm';
import { WorkShiftConfiguration } from '../../employees/entities/work-shift-configuration.entity';
import { WorkShiftSession } from '../../employees/entities/work-shift-session.entity';
import { LocationConfiguration } from '../../employees/entities/location-configuration.entity';
import {
  Employee,
  EmployeeStatus,
} from '../../employees/employee.entity';
import { EmployeeEmploymentDetail } from '../../employees/entities/employee-employment-detail.entity';
import { OrganizationSetting } from '../../settings/entities/organization-setting.entity';
import { SETTING_KEYS, VALID_WEEKDAYS } from '../../settings/settings.constants';
import { OrganizationCalendarQueryService } from '../../settings/organization-calendar-query.service';
import { AccessScope } from '../../rbac/constants/access-scope.enum';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { resolveEmployeeLocationId } from '../leave/utils/leave-location.util';
import {
  AttendancePunch,
  AttendancePunchType,
} from '../entities/attendance-punch.entity';
import {
  AttendanceDailySummary,
  AttendanceDayStatus,
} from '../entities/attendance-daily-summary.entity';
import { AttendanceSession } from '../entities/attendance-session.entity';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import { LeavePolicyService } from '../leave/leave-policy.service';
import {
  findLeaveRequestsOverlappingRange,
  toDateKey,
} from '../leave/leave-request-query.util';
import {
  SIGN_IN_LOCATION_LABELS,
  type SignInLocationCode,
} from './dto/sign-punch.dto';
import {
  addCalendarDays,
  buildOrgWallClockDate,
  formatDateInOrg,
  formatTimeInOrg,
  orgDateKeyForInstant,
  orgDayBounds,
  resolveOrgTimezone,
} from '../../common/utils/org-timezone.util';
import {
  calcEarlyOutMinutes,
  calcLateInMinutes,
  calcShortfallAndExcess,
  calcWorkInShiftMinutes,
  dayOfWeekShort,
  formatLateEarlyMinutes,
  formatMinutesAsHhMm,
  formatProcessedAt,
  grossShiftSpanMinutes,
  hasCompleteInOutPair,
  isOvernightShift,
  isRestDay,
  matchShiftByName,
  pairPunches,
  resolveShiftEndDate,
  shouldFlagAttendanceException,
} from '../shared/attendance-shift.util';
import {
  daysInMonth,
  formatHomeDate,
} from '../shared/ess-format.util';

export const WHO_IS_IN_PERMISSION = 'dashboard.ess.who-is-in:read';
export const EMPLOYEE_SWIPES_PERMISSION = 'ess.attendance.swipes:read';

const SWIPES_MAX_RANGE_DAYS = 31;
const SWIPES_EXPORT_MAX_ROWS = 5000;

type ShiftSessionDef = {
  sessionLabel: string;
  startTime: string;
  endTime: string;
};

@Injectable()
export class EssAttendanceService {
  constructor(
    private readonly policyService: LeavePolicyService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly calendarQuery: OrganizationCalendarQueryService,
  ) {}

  todayLocalDateKey(timezone?: string | null): string {
    return orgDateKeyForInstant(new Date(), timezone);
  }

  async getRegularizationContext(
    em: DataSource | EntityManager,
    organizationId: string,
    employeeId: string,
  ): Promise<{
    timezone: string;
    overnight: boolean;
    today: string;
    shift: WorkShiftConfiguration;
  }> {
    const shift = await this.requireEmployeeShift(em, organizationId, employeeId);
    const { timezone } = await this.loadAttendancePolicy(em);
    return {
      timezone,
      overnight: isOvernightShift(shift.startTime, shift.endTime),
      today: this.todayLocalDateKey(timezone),
      shift,
    };
  }

  /**
   * Write approved regularization IN/OUT punches and rebuild the daily summary.
   */
  async applyRegularizationPunches(
    em: EntityManager,
    organizationId: string,
    employeeId: string,
    workDate: string,
    requestedInAt: Date,
    requestedOutAt: Date,
  ): Promise<void> {
    const shift = await this.requireEmployeeShift(em, organizationId, employeeId);
    const { timezone } = await this.loadAttendancePolicy(em);
    const overnight = isOvernightShift(shift.startTime, shift.endTime);
    const punches = await this.getPunchesForDay(
      em,
      organizationId,
      employeeId,
      workDate,
      timezone,
      { includeNextCalendarDay: overnight },
    );
    const pairs = pairPunches(punches, {
      workDateKey: workDate,
      dateKeyForInstant: (instant) => orgDateKeyForInstant(instant, timezone),
    });
    if (hasCompleteInOutPair(pairs)) {
      throw new ConflictException(
        'This day already has a complete check-in and check-out',
      );
    }

    const punchRepo = em.getRepository(AttendancePunch);
    await punchRepo.save([
      punchRepo.create({
        organizationId,
        employeeId,
        punchedAt: requestedInAt,
        punchType: AttendancePunchType.IN,
        source: 'REGULARIZATION',
      }),
      punchRepo.create({
        organizationId,
        employeeId,
        punchedAt: requestedOutAt,
        punchType: AttendancePunchType.OUT,
        source: 'REGULARIZATION',
      }),
    ]);

    await this.recomputeDailySummary(
      em,
      organizationId,
      employeeId,
      workDate,
      shift,
    );
  }

  async dayHasCompletePunchPair(
    em: DataSource | EntityManager,
    organizationId: string,
    employeeId: string,
    workDate: string,
  ): Promise<boolean> {
    const { timezone } = await this.loadAttendancePolicy(em);
    const { shift } = await this.resolveEmployeeShift(
      em,
      organizationId,
      employeeId,
    );
    const overnight = shift
      ? isOvernightShift(shift.startTime, shift.endTime)
      : false;
    const punches = await this.getPunchesForDay(
      em,
      organizationId,
      employeeId,
      workDate,
      timezone,
      { includeNextCalendarDay: overnight },
    );
    const pairs = pairPunches(punches, {
      workDateKey: workDate,
      dateKeyForInstant: (instant) => orgDateKeyForInstant(instant, timezone),
    });
    return hasCompleteInOutPair(pairs);
  }

  private dayBoundsLocal(
    workDate: string,
    timezone?: string | null,
  ): { start: Date; end: Date } {
    return orgDayBounds(workDate, timezone);
  }

  async isSignedIn(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ): Promise<boolean> {
    const open = await this.findOpenSessionContext(
      dataSource,
      organizationId,
      employeeId,
    );
    if (open) return true;

    // Employees without a configured shift still track calendar-day open IN/OUT.
    const { timezone } = await this.loadAttendancePolicy(dataSource);
    const workDate = this.todayLocalDateKey(timezone);
    const punches = await this.getPunchesForDay(
      dataSource,
      organizationId,
      employeeId,
      workDate,
      timezone,
    );
    return this.hasOpenSession(punches);
  }

  async signIn(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    latitude?: number,
    longitude?: number,
    ipAddress?: string | null,
    signInLocation?: string | null,
  ) {
    return dataSource.transaction(async (em) => {
      const { timezone } = await this.loadAttendancePolicy(em);
      const workDate = this.todayLocalDateKey(timezone);
      const shift = await this.requireEmployeeShift(em, organizationId, employeeId);

      const open = await this.findOpenSessionContext(
        em,
        organizationId,
        employeeId,
        timezone,
        shift,
      );
      if (open) {
        throw new ConflictException('You are already signed in');
      }

      const now = new Date();
      const punchRepo = em.getRepository(AttendancePunch);
      await punchRepo.save(
        punchRepo.create({
          organizationId,
          employeeId,
          punchedAt: now,
          punchType: AttendancePunchType.IN,
          source: 'WEB',
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          ipAddress: ipAddress ?? null,
          signInLocation: signInLocation ?? null,
        }),
      );

      await this.recomputeDailySummary(em, organizationId, employeeId, workDate, shift);

      return { signedIn: true, punchedAt: now.toISOString() };
    });
  }

  async signOut(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    latitude?: number,
    longitude?: number,
    ipAddress?: string | null,
  ) {
    return dataSource.transaction(async (em) => {
      const { timezone } = await this.loadAttendancePolicy(em);
      const shift = await this.requireEmployeeShift(em, organizationId, employeeId);
      const open = await this.findOpenSessionContext(
        em,
        organizationId,
        employeeId,
        timezone,
        shift,
      );
      if (!open) {
        throw new BadRequestException('You are not signed in');
      }

      const workDate = open.workDate;
      const now = new Date();
      const punchRepo = em.getRepository(AttendancePunch);
      await punchRepo.save(
        punchRepo.create({
          organizationId,
          employeeId,
          punchedAt: now,
          punchType: AttendancePunchType.OUT,
          source: 'WEB',
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          ipAddress: ipAddress ?? null,
        }),
      );

      await this.recomputeDailySummary(
        em,
        organizationId,
        employeeId,
        workDate,
        open.shift,
      );

      return { signedIn: false, punchedAt: now.toISOString() };
    });
  }

  async getTodayStatus(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const { timezone } = await this.loadAttendancePolicy(dataSource);
    const workDate = this.todayLocalDateKey(timezone);
    const signedIn = await this.isSignedIn(
      dataSource,
      organizationId,
      employeeId,
    );
    const { shift } = await this.resolveEmployeeShift(
      dataSource,
      organizationId,
      employeeId,
    );
    const shiftLabel = shift
      ? `${shift.name} (${shift.startTime} - ${shift.endTime})`
      : 'No shift assigned';

    return {
      date: formatHomeDate(workDate),
      shift: shiftLabel,
      signedIn,
    };
  }

  async getSummary(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
    month: number,
  ) {
    const policy = await this.loadAttendancePolicy(dataSource);
    const monthPad = String(month).padStart(2, '0');
    const lastDay = daysInMonth(year, month);
    const rangeStart = `${year}-${monthPad}-01`;
    const rangeEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

    const summaries = await dataSource
      .getRepository(AttendanceDailySummary)
      .find({
        where: {
          organizationId,
          employeeId,
          workDate: Between(rangeStart, rangeEnd),
        },
      });

    const present = summaries.filter((s) => s.status === AttendanceDayStatus.P);
    const exceptionDays = summaries.filter((s) => s.exceptionFlag).length;

    const totalMinutes = present.reduce((acc, s) => acc + s.actualWorkMinutes, 0);
    const avgMinutes =
      present.length > 0 ? Math.round(totalMinutes / present.length) : 0;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevAvg = await this.averageActualMinutes(
      dataSource,
      organizationId,
      employeeId,
      prevYear,
      prevMonth,
    );

    const trend =
      prevAvg > 0
        ? `${Math.round(((avgMinutes - prevAvg) / prevAvg) * 100)}% From ${this.monthName(prevMonth)}`
        : `0% From ${this.monthName(prevMonth)}`;

    return {
      exceptionDays,
      avgWorkHrs: formatMinutesAsHhMm(avgMinutes),
      avgWorkHrsTrend: trend,
      avgActualWorkHrs: formatMinutesAsHhMm(avgMinutes),
      avgActualWorkHrsTrend: trend,
      penaltyDays: summaries.filter(
        (s) =>
          s.status === AttendanceDayStatus.A &&
          !isRestDay(s.workDate, policy.workingDays),
      ).length,
      insightsCount: exceptionDays > 0 ? Math.min(exceptionDays, 3) : 0,
      year,
      month,
    };
  }

  async getDays(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
    month: number,
  ) {
    const policy = await this.loadAttendancePolicy(dataSource);
    const monthPad = String(month).padStart(2, '0');
    const lastDay = daysInMonth(year, month);
    const rangeStart = `${year}-${monthPad}-01`;
    const rangeEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

    const summaries = await dataSource
      .getRepository(AttendanceDailySummary)
      .find({
        where: {
          organizationId,
          employeeId,
          workDate: Between(rangeStart, rangeEnd),
        },
        relations: ['shiftConfiguration'],
      });

    const byDate = new Map(summaries.map((s) => [s.workDate, s]));
    const days: Record<string, object> = {};

    for (let d = 1; d <= lastDay; d += 1) {
      const key = `${year}-${monthPad}-${String(d).padStart(2, '0')}`;
      const summary = byDate.get(key);
      if (summary) {
        const shiftCode = summary.shiftConfiguration?.name
          ? summary.shiftConfiguration.name.replace(/\s+/g, '').slice(0, 4).toUpperCase()
          : undefined;
        days[key] = {
          date: key,
          status: summary.status,
          shiftCode,
          hasBreak: (summary.shiftConfiguration?.breakMinutes ?? 0) > 0,
        };
      } else if (isRestDay(key, policy.workingDays)) {
        days[key] = { date: key, status: AttendanceDayStatus.R };
      } else {
        days[key] = { date: key, status: AttendanceDayStatus.A };
      }
    }

    return { year, month, days };
  }

  async getDayDetail(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    date: string,
  ) {
    const ctx = await this.resolveEmployeeShift(
      dataSource,
      organizationId,
      employeeId,
    );
    const { timezone } = await this.loadAttendancePolicy(dataSource);
    const shiftHint =
      (await dataSource.getRepository(AttendanceDailySummary).findOne({
        where: { organizationId, employeeId, workDate: date },
        relations: ['shiftConfiguration'],
      }))?.shiftConfiguration ?? ctx.shift;
    const overnight = shiftHint
      ? isOvernightShift(shiftHint.startTime, shiftHint.endTime)
      : false;

    const punches = await this.getPunchesForDay(
      dataSource,
      organizationId,
      employeeId,
      date,
      timezone,
      { includeNextCalendarDay: overnight },
    );
    const workDatePairs = pairPunches(punches, {
      workDateKey: date,
      dateKeyForInstant: (instant) => orgDateKeyForInstant(instant, timezone),
    });
    const punchIdsForWorkDate = new Set<string>();
    for (const p of punches) {
      const belongs = workDatePairs.some((pair) => {
        if (pair.in.getTime() === p.punchedAt.getTime()) return true;
        if (pair.out && pair.out.getTime() === p.punchedAt.getTime()) return true;
        return false;
      });
      if (belongs) punchIdsForWorkDate.add(p.id);
    }
    const displayPunches = punches.filter((p) => punchIdsForWorkDate.has(p.id));

    const summaryRepo = dataSource.getRepository(AttendanceDailySummary);
    let existingSummary = await summaryRepo.findOne({
      where: { organizationId, employeeId, workDate: date },
      relations: ['shiftConfiguration'],
    });

    const shiftForRecompute =
      existingSummary?.shiftConfiguration ?? ctx.shift ?? null;

    if (displayPunches.length > 0 && shiftForRecompute) {
      await dataSource.transaction(async (em) => {
        await this.recomputeDailySummary(
          em,
          organizationId,
          employeeId,
          date,
          shiftForRecompute,
        );
      });
    }

    const summary = await summaryRepo.findOne({
      where: { organizationId, employeeId, workDate: date },
      relations: ['shiftConfiguration', 'sessions'],
    });

    const swipes = displayPunches.map((p) => ({
      id: p.id,
      punchedAt: p.punchedAt.toISOString(),
      swipeTime: formatTimeInOrg(p.punchedAt, timezone),
      swipeDate: formatDateInOrg(p.punchedAt, timezone),
      location: ctx.locationName ?? '-',
      source: p.source,
    }));

    if (!summary) {
      return {
        ...this.emptyDayDetail(date, ctx.shift),
        locationName: ctx.locationName ?? '—',
        dayOfWeek: dayOfWeekShort(date),
        processedAt: null,
        workHoursInShift: '-',
        shortfallHrs: '-',
        excessHrs: '-',
        progressPercent: 0,
        permissions: [],
        swipes,
      };
    }

    const shift = summary.shiftConfiguration ?? ctx.shift;
    const shiftName = shift?.name ?? '—';
    const shiftCode = shiftName.replace(/\s/g, '').slice(0, 4).toUpperCase();
    const shiftTime = shift
      ? `${shift.startTime} to ${shift.endTime}`
      : '—';

    const shiftStart =
      shift && date
        ? buildOrgWallClockDate(date, shift.startTime, timezone)
        : null;
    const shiftEndDate =
      shift && date
        ? resolveShiftEndDate(
            shiftStart,
            buildOrgWallClockDate(date, shift.endTime, timezone),
          )
        : null;
    const displayLateIn = calcLateInMinutes(summary.firstIn ?? null, shiftStart);
    const displayEarlyOut = calcEarlyOutMinutes(
      summary.lastOut ?? null,
      shiftEndDate,
    );

    const sessions = (summary.sessions ?? [])
      .sort(
        (a, b) =>
          (a.sessionStart?.getTime() ?? 0) - (b.sessionStart?.getTime() ?? 0),
      )
      .map((s) => ({
        session: s.sessionLabel,
        timing:
          s.sessionStart && s.sessionEnd
            ? `${formatTimeInOrg(s.sessionStart, timezone)} - ${formatTimeInOrg(s.sessionEnd, timezone)}`
            : '—',
        firstIn: formatTimeInOrg(s.firstIn, timezone),
        lastOut: formatTimeInOrg(s.lastOut, timezone),
      }));

    const expectedNet = shift
      ? Math.max(0, grossShiftSpanMinutes(shift.startTime, shift.endTime) - (shift.breakMinutes ?? 0))
      : 0;
    const progressPercent =
      expectedNet > 0
        ? Math.min(100, Math.round((summary.workInShiftMinutes / expectedNet) * 100))
        : 0;

    return {
      date,
      dayOfWeek: dayOfWeekShort(date),
      shiftName: shift ? `${shiftName}(${shiftCode})` : shiftName,
      shiftTime,
      scheme: shift ? `${shift.name} scheme` : '—',
      schemeLabel: 'Attendance Scheme',
      firstIn: formatTimeInOrg(summary.firstIn, timezone),
      lastOut: formatTimeInOrg(summary.lastOut, timezone),
      lateIn: formatLateEarlyMinutes(displayLateIn),
      earlyOut: formatLateEarlyMinutes(displayEarlyOut),
      totalWorkHrs: formatMinutesAsHhMm(summary.totalWorkMinutes),
      breakHrs:
        summary.breakMinutes > 0 ? formatMinutesAsHhMm(summary.breakMinutes) : '-',
      actualWork: formatMinutesAsHhMm(summary.actualWorkMinutes),
      workHoursInShift: formatMinutesAsHhMm(summary.workInShiftMinutes),
      shortfallHrs:
        summary.shortfallMinutes > 0
          ? formatMinutesAsHhMm(summary.shortfallMinutes)
          : '-',
      excessHrs:
        summary.excessMinutes > 0
          ? formatMinutesAsHhMm(summary.excessMinutes)
          : '-',
      progressPercent,
      processedAt: summary.updatedAt
        ? formatProcessedAt(summary.updatedAt)
        : null,
      locationName: ctx.locationName ?? '—',
      status: summary.status,
      remarks: summary.remarks ?? '-',
      sessions,
      permissions: [],
      swipes,
    };
  }

  private emptyDayDetail(date: string, shift?: WorkShiftConfiguration | null) {
    const shiftName = shift?.name ?? '—';
    const shiftCode = shiftName.replace(/\s/g, '').slice(0, 4).toUpperCase();
    return {
      date,
      dayOfWeek: dayOfWeekShort(date),
      shiftName: shift ? `${shiftName}(${shiftCode})` : shiftName,
      shiftTime: shift ? `${shift.startTime} to ${shift.endTime}` : '—',
      scheme: shift ? `${shift.name} scheme` : '—',
      schemeLabel: 'Attendance Scheme',
      firstIn: '-',
      lastOut: '-',
      lateIn: '-',
      earlyOut: '-',
      totalWorkHrs: '-',
      breakHrs: '-',
      actualWork: '-',
      workHoursInShift: '-',
      shortfallHrs: '-',
      excessHrs: '-',
      progressPercent: 0,
      processedAt: null,
      status: '-',
      remarks: '-',
      sessions: [],
      permissions: [],
      swipes: [],
    };
  }

  private async getPunchesForDay(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
    workDate: string,
    timezone?: string | null,
    options?: { includeNextCalendarDay?: boolean },
  ): Promise<AttendancePunch[]> {
    const { start } = this.dayBoundsLocal(workDate, timezone);
    const endDate = options?.includeNextCalendarDay
      ? addCalendarDays(workDate, 1)
      : workDate;
    const { end } = this.dayBoundsLocal(endDate, timezone);
    return em.getRepository(AttendancePunch).find({
      where: {
        organizationId,
        employeeId,
        punchedAt: Between(start, end),
      },
      order: { punchedAt: 'ASC' },
    });
  }

  /**
   * Find an open IN (no matching OUT) for today, or yesterday when the shift spans midnight.
   */
  private async findOpenSessionContext(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
    timezone?: string | null,
    knownShift?: WorkShiftConfiguration | null,
  ): Promise<{ workDate: string; shift: WorkShiftConfiguration } | null> {
    const policy =
      timezone != null
        ? { timezone }
        : await this.loadAttendancePolicy(em);
    const tz = policy.timezone;
    const today = this.todayLocalDateKey(tz);

    let shift = knownShift ?? null;
    if (!shift) {
      const resolved = await this.resolveEmployeeShift(
        em as DataSource,
        organizationId,
        employeeId,
      );
      shift = resolved.shift;
    }

    const overnight = shift
      ? isOvernightShift(shift.startTime, shift.endTime)
      : false;
    const candidates = overnight
      ? [today, addCalendarDays(today, -1)]
      : [today];

    for (const workDate of candidates) {
      const punches = await this.getPunchesForDay(
        em,
        organizationId,
        employeeId,
        workDate,
        tz,
        { includeNextCalendarDay: overnight },
      );
      const pairs = pairPunches(punches, {
        workDateKey: workDate,
        dateKeyForInstant: (instant) => orgDateKeyForInstant(instant, tz),
      });
      if (pairs.some((p) => !p.out)) {
        if (!shift) return null;
        return { workDate, shift };
      }
    }
    return null;
  }

  private hasOpenSession(punches: AttendancePunch[]): boolean {
    let open = false;
    for (const p of punches) {
      if (p.punchType === AttendancePunchType.IN) open = true;
      if (p.punchType === AttendancePunchType.OUT) open = false;
    }
    return open;
  }

  private async recomputeDailySummary(
    em: import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
    workDate: string,
    shift: WorkShiftConfiguration,
  ) {
    const policy = await this.loadAttendancePolicy(em);
    const overnight = isOvernightShift(shift.startTime, shift.endTime);
    const punches = await this.getPunchesForDay(
      em,
      organizationId,
      employeeId,
      workDate,
      policy.timezone,
      { includeNextCalendarDay: overnight },
    );

    const pairs = pairPunches(punches, {
      workDateKey: workDate,
      dateKeyForInstant: (instant) =>
        orgDateKeyForInstant(instant, policy.timezone),
    });

    const firstIn = pairs.length > 0 ? pairs[0].in : null;
    const closedPairs = pairs.filter((p) => p.out);
    const lastOut =
      closedPairs.length > 0 ? closedPairs[closedPairs.length - 1].out! : null;

    let totalWorkMinutes = 0;
    for (const pair of pairs) {
      if (pair.out) {
        totalWorkMinutes += Math.max(
          0,
          Math.round((pair.out.getTime() - pair.in.getTime()) / 60000),
        );
      }
    }

    const breakMinutes = shift.breakMinutes ?? 0;
    const actualWorkMinutes = Math.max(0, totalWorkMinutes - breakMinutes);

    const shiftStart = buildOrgWallClockDate(
      workDate,
      shift.startTime,
      policy.timezone,
    );
    const shiftEnd = buildOrgWallClockDate(
      workDate,
      shift.endTime,
      policy.timezone,
    );
    const shiftEndDate = resolveShiftEndDate(shiftStart, shiftEnd);
    const now = new Date();

    const workInShiftMinutes = calcWorkInShiftMinutes(
      pairs,
      shiftStart,
      shiftEndDate,
      now,
    );

    const expectedNetMinutes = Math.max(
      0,
      grossShiftSpanMinutes(shift.startTime, shift.endTime) - breakMinutes,
    );
    const { shortfallMinutes, excessMinutes } = calcShortfallAndExcess(
      expectedNetMinutes,
      workInShiftMinutes,
      actualWorkMinutes,
    );

    const grace = policy.graceMinutes;
    const lateInMinutes = calcLateInMinutes(firstIn, shiftStart);
    const earlyOutMinutes = calcEarlyOutMinutes(lastOut, shiftEndDate);

    const rest = isRestDay(workDate, policy.workingDays);
    let status = AttendanceDayStatus.A;
    if (rest) {
      status = AttendanceDayStatus.R;
    } else if (firstIn) {
      status = AttendanceDayStatus.P;
    }

    const exceptionFlag = shouldFlagAttendanceException({
      rest,
      absent: status === AttendanceDayStatus.A,
      lastOut,
      lateInMinutes,
      earlyOutMinutes,
      shortfallMinutes,
      graceMinutes: grace,
    });

    const repo = em.getRepository(AttendanceDailySummary);
    let summary = await repo.findOne({
      where: { organizationId, employeeId, workDate },
    });

    if (!summary) {
      summary = repo.create({
        organizationId,
        employeeId,
        workDate,
      });
    }

    summary.status = status;
    summary.shiftConfigurationId = shift.id;
    summary.firstIn = firstIn;
    summary.lastOut = lastOut;
    summary.totalWorkMinutes = totalWorkMinutes;
    summary.breakMinutes = breakMinutes;
    summary.actualWorkMinutes = actualWorkMinutes;
    summary.workInShiftMinutes = workInShiftMinutes;
    summary.shortfallMinutes = shortfallMinutes;
    summary.excessMinutes = excessMinutes;
    summary.exceptionFlag = exceptionFlag;
    summary.lateInMinutes = lateInMinutes;
    summary.earlyOutMinutes = earlyOutMinutes;
    summary.remarks = exceptionFlag ? 'Exception' : null;

    summary = await repo.save(summary);

    await em.getRepository(AttendanceSession).delete({
      dailySummaryId: summary.id,
    });

    const sessionDefs = await this.getShiftSessionDefs(em, shift);
    const workDatePunchTimes = new Set<number>();
    for (const pair of pairs) {
      workDatePunchTimes.add(pair.in.getTime());
      if (pair.out) workDatePunchTimes.add(pair.out.getTime());
    }
    const inPunches = punches.filter(
      (p) =>
        p.punchType === AttendancePunchType.IN &&
        workDatePunchTimes.has(p.punchedAt.getTime()),
    );
    const outPunches = punches.filter(
      (p) =>
        p.punchType === AttendancePunchType.OUT &&
        workDatePunchTimes.has(p.punchedAt.getTime()),
    );
    const dayFirstIn = inPunches[0]?.punchedAt ?? null;
    const dayLastOut = outPunches[outPunches.length - 1]?.punchedAt ?? null;

    const sessionEntities = sessionDefs.map((def, idx) => {
      const winStart = buildOrgWallClockDate(
        workDate,
        def.startTime,
        policy.timezone,
      )!;
      let winEnd = buildOrgWallClockDate(
        workDate,
        def.endTime,
        policy.timezone,
      )!;
      if (winEnd.getTime() <= winStart.getTime()) {
        winEnd = new Date(winEnd.getTime() + 24 * 60 * 60 * 1000);
      }

      const isFirst = idx === 0;
      const isLast = idx === sessionDefs.length - 1;

      const insInWindow = inPunches.filter(
        (p) => p.punchedAt >= winStart && p.punchedAt <= winEnd,
      );
      const outsInWindow = outPunches.filter(
        (p) => p.punchedAt >= winStart && p.punchedAt <= winEnd,
      );

      const sessionFirstIn = isFirst
        ? dayFirstIn
        : insInWindow[0]?.punchedAt ?? null;
      const sessionLastOut = isLast
        ? dayLastOut
        : outsInWindow[outsInWindow.length - 1]?.punchedAt ?? null;

      return em.getRepository(AttendanceSession).create({
        dailySummaryId: summary!.id,
        sessionLabel: def.sessionLabel,
        sessionStart: winStart,
        sessionEnd: winEnd,
        firstIn: sessionFirstIn,
        lastOut: sessionLastOut,
      });
    });

    if (sessionEntities.length > 0) {
      await em.getRepository(AttendanceSession).save(sessionEntities);
    }

    return summary;
  }

  private async getShiftSessionDefs(
    em: DataSource | import('typeorm').EntityManager,
    shift: WorkShiftConfiguration,
  ): Promise<ShiftSessionDef[]> {
    const rows = await em.getRepository(WorkShiftSession).find({
      where: { shiftConfigurationId: shift.id },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    if (rows.length > 0) {
      return rows.map((r) => ({
        sessionLabel: r.sessionLabel,
        startTime: r.startTime,
        endTime: r.endTime,
      }));
    }

    return [
      {
        sessionLabel: 'Session 1',
        startTime: shift.startTime,
        endTime: shift.endTime,
      },
    ];
  }

  private async resolveEmployeeShift(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
  ): Promise<{
    shift: WorkShiftConfiguration | null;
    locationId: string | null;
    locationName: string | null;
  }> {
    const { locationId, employment } = await this.policyService.getEmployeeContext(
      em as DataSource,
      organizationId,
      employeeId,
    );

    let locationName: string | null = null;
    if (locationId) {
      const loc = await em.getRepository(LocationConfiguration).findOne({
        where: { id: locationId },
      });
      locationName = loc?.name ?? null;
    }

    if (!locationId) {
      return { shift: null, locationId: null, locationName };
    }

    const shifts = await em.getRepository(WorkShiftConfiguration).find({
      where: { locationId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    if (shifts.length === 0) {
      return { shift: null, locationId, locationName };
    }

    const matched = matchShiftByName(employment?.shift, shifts);
    if (matched) {
      const shift = shifts.find((s) => s.name === matched.name) ?? null;
      return { shift, locationId, locationName };
    }

    if (shifts.length === 1) {
      return { shift: shifts[0], locationId, locationName };
    }

    return { shift: null, locationId, locationName };
  }

  private async requireEmployeeShift(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
  ): Promise<WorkShiftConfiguration> {
    const { shift, locationId, locationName } = await this.resolveEmployeeShift(
      em,
      organizationId,
      employeeId,
    );

    if (!locationId) {
      throw new BadRequestException(
        'Your branch or business unit is not configured. Please contact HR to assign a location.',
      );
    }

    const shifts = await em.getRepository(WorkShiftConfiguration).find({
      where: { locationId },
    });

    if (shifts.length === 0) {
      throw new BadRequestException(
        `No shifts are configured for ${locationName ?? 'your branch'}. Please contact HR.`,
      );
    }

    if (!shift) {
      throw new BadRequestException(
        'Your work shift is not assigned. Please contact HR to set your shift for this branch.',
      );
    }

    return shift;
  }

  private async loadAttendancePolicy(
    em: DataSource | import('typeorm').EntityManager,
  ): Promise<{
    graceMinutes: number;
    workingDays: string[] | null;
    timezone: string;
  }> {
    const repo = em.getRepository(OrganizationSetting);
    const keys = [
      SETTING_KEYS.ATTENDANCE_GRACE_PERIOD,
      SETTING_KEYS.ATTENDANCE_WORKING_DAYS,
      SETTING_KEYS.ORG_TIMEZONE,
    ];
    const rows = await repo.find({ where: { key: In(keys) } });

    let graceMinutes = 0;
    let workingDays: string[] | null = null;
    let timezone = resolveOrgTimezone(null);

    for (const row of rows) {
      if (row.key === SETTING_KEYS.ATTENDANCE_GRACE_PERIOD) {
        const v = Number(row.value);
        graceMinutes = Number.isFinite(v) && v >= 0 ? v : 0;
      }
      if (row.key === SETTING_KEYS.ATTENDANCE_WORKING_DAYS) {
        if (Array.isArray(row.value)) {
          workingDays = row.value.filter((d) =>
            (VALID_WEEKDAYS as readonly string[]).includes(d),
          );
        }
      }
      if (row.key === SETTING_KEYS.ORG_TIMEZONE) {
        timezone = resolveOrgTimezone(
          typeof row.value === 'string' ? row.value : null,
        );
      }
    }

    return { graceMinutes, workingDays, timezone };
  }

  private async averageActualMinutes(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
    month: number,
  ): Promise<number> {
    const monthPad = String(month).padStart(2, '0');
    const lastDay = daysInMonth(year, month);
    const rangeStart = `${year}-${monthPad}-01`;
    const rangeEnd = `${year}-${monthPad}-${String(lastDay).padStart(2, '0')}`;

    const summaries = await dataSource
      .getRepository(AttendanceDailySummary)
      .find({
        where: {
          organizationId,
          employeeId,
          workDate: Between(rangeStart, rangeEnd),
          status: AttendanceDayStatus.P,
        },
      });

    if (summaries.length === 0) return 0;
    const total = summaries.reduce((a, s) => a + s.actualWorkMinutes, 0);
    return Math.round(total / summaries.length);
  }

  private monthName(month: number): string {
    const names = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return names[month - 1] ?? 'prior month';
  }

  /**
   * Scoped punch list for Employee Swipes screen.
   */
  async getEmployeeSwipes(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    params: {
      from: string;
      to: string;
      q?: string;
      punchType?: 'IN' | 'OUT';
      page?: number;
      pageSize?: number;
    },
  ) {
    this.assertSwipesDateRange(params.from, params.to);
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));

    const scoped = await this.resolveSwipesEmployeeIds(
      dataSource,
      organizationId,
      actorEmployeeId,
    );
    if (scoped === 'empty') {
      return {
        from: params.from,
        to: params.to,
        page,
        pageSize,
        total: 0,
        items: [] as ReturnType<typeof mapSwipeRow>[],
      };
    }

    const policy = await this.loadAttendancePolicy(dataSource);
    const { start } = this.dayBoundsLocal(params.from, policy.timezone);
    const { end } = this.dayBoundsLocal(params.to, policy.timezone);

    const qb = dataSource
      .getRepository(AttendancePunch)
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.employee', 'e')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.punchedAt >= :start', { start })
      .andWhere('p.punchedAt <= :end', { end })
      .andWhere('p.deletedAt IS NULL');

    if (scoped !== null) {
      if (scoped.length === 0) {
        return {
          from: params.from,
          to: params.to,
          page,
          pageSize,
          total: 0,
          items: [] as ReturnType<typeof mapSwipeRow>[],
        };
      }
      qb.andWhere('p.employeeId IN (:...employeeIds)', { employeeIds: scoped });
    }

    if (params.punchType) {
      qb.andWhere('p.punchType = :punchType', { punchType: params.punchType });
    }

    const q = String(params.q ?? '').trim();
    if (q) {
      qb.andWhere(
        '(LOWER(e.name) LIKE :q OR LOWER(COALESCE(e.employeeCode, \'\')) LIKE :q)',
        { q: `%${q.toLowerCase()}%` },
      );
    }

    const total = await qb.clone().getCount();

    const punches = await qb
      .orderBy('p.punchedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const items = await this.mapPunchesToSwipeRows(
      dataSource,
      organizationId,
      punches,
      policy.timezone,
    );

    return {
      from: params.from,
      to: params.to,
      page,
      pageSize,
      total,
      items,
    };
  }

  async exportEmployeeSwipesCsv(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    params: {
      from: string;
      to: string;
      q?: string;
      punchType?: 'IN' | 'OUT';
    },
  ): Promise<{ filename: string; csv: string }> {
    const result = await this.getEmployeeSwipes(
      dataSource,
      organizationId,
      actorEmployeeId,
      {
        ...params,
        page: 1,
        pageSize: SWIPES_EXPORT_MAX_ROWS,
      },
    );

    const header = [
      'Employee Name',
      'Employee Code',
      'Swipe Time',
      'Swipe Date',
      'Shift',
      'Received Time',
      'Received Date',
      'Punch Type',
      'Source',
      'Door/Address',
    ];
    const lines = [header.join(',')];
    for (const row of result.items) {
      lines.push(
        [
          csvEscape(row.name),
          csvEscape(row.employeeCode),
          csvEscape(row.swipeTime),
          csvEscape(row.swipeDate),
          csvEscape(row.shiftName ?? ''),
          csvEscape(row.receivedTime),
          csvEscape(row.receivedDate),
          csvEscape(row.punchType),
          csvEscape(row.sourceLabel),
          '',
        ].join(','),
      );
    }

    return {
      filename: `employee-swipes-${params.from}-to-${params.to}.csv`,
      csv: lines.join('\n'),
    };
  }

  private assertSwipesDateRange(from: string, to: string) {
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
    if (days > SWIPES_MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${SWIPES_MAX_RANGE_DAYS} days`,
      );
    }
  }

  /**
   * @returns null = org-wide; string[] = scoped ids excluding actor; 'empty' = no roster
   */
  private async resolveSwipesEmployeeIds(
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
      auth.permissionScopes.get(EMPLOYEE_SWIPES_PERMISSION) ?? AccessScope.SELF;

    if (scope === AccessScope.SELF) {
      return 'empty';
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      EMPLOYEE_SWIPES_PERMISSION,
      auth,
    );

    if (visibleIds === null) {
      return null;
    }

    return visibleIds.filter((id) => id !== actorEmployeeId);
  }

  private async mapPunchesToSwipeRows(
    dataSource: DataSource,
    organizationId: string,
    punches: AttendancePunch[],
    timezone: string,
  ) {
    if (punches.length === 0) return [] as ReturnType<typeof mapSwipeRow>[];

    const employeeWorkDates = new Map<string, Set<string>>();
    for (const p of punches) {
      const workDate = orgDateKeyForInstant(p.punchedAt, timezone);
      if (!employeeWorkDates.has(p.employeeId)) {
        employeeWorkDates.set(p.employeeId, new Set());
      }
      employeeWorkDates.get(p.employeeId)!.add(workDate);
    }

    const employeeIds = [...employeeWorkDates.keys()];
    const allDates = [
      ...new Set([...employeeWorkDates.values()].flatMap((s) => [...s])),
    ];

    const summaries =
      employeeIds.length > 0 && allDates.length > 0
        ? await dataSource.getRepository(AttendanceDailySummary).find({
            where: {
              organizationId,
              employeeId: In(employeeIds),
              workDate: In(allDates),
            },
            relations: ['shiftConfiguration'],
          })
        : [];

    const shiftByEmpDate = new Map<string, string | null>();
    for (const s of summaries) {
      shiftByEmpDate.set(
        `${s.employeeId}|${s.workDate}`,
        s.shiftConfiguration?.name ?? null,
      );
    }

    const shiftCache = new Map<string, string | null>();

    const rows: ReturnType<typeof mapSwipeRow>[] = [];
    for (const p of punches) {
      const workDate = orgDateKeyForInstant(p.punchedAt, timezone);
      const key = `${p.employeeId}|${workDate}`;
      let shiftName = shiftByEmpDate.get(key) ?? null;
      if (shiftName === null && !shiftByEmpDate.has(key)) {
        if (!shiftCache.has(p.employeeId)) {
          const ctx = await this.resolveEmployeeShift(
            dataSource,
            organizationId,
            p.employeeId,
          );
          shiftCache.set(p.employeeId, ctx.shift?.name ?? null);
        }
        shiftName = shiftCache.get(p.employeeId) ?? null;
      }

      rows.push(
        mapSwipeRow(p, {
          timezone,
          shiftName,
        }),
      );
    }
    return rows;
  }

  /**
   * Team/org roster buckets for a work date: not yet in / late / on time / out of office.
   */
  async getWhoIsIn(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    date?: string,
  ) {
    const policy = await this.loadAttendancePolicy(dataSource);
    const workDate = date ?? this.todayLocalDateKey(policy.timezone);
    const empty = emptyWhoIsInPayload(workDate, policy.timezone);

    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const scope =
      auth.permissionScopes.get(WHO_IS_IN_PERMISSION) ?? AccessScope.SELF;

    if (scope === AccessScope.SELF) {
      return empty;
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      WHO_IS_IN_PERMISSION,
      auth,
    );

    let employeeIds: string[] | null =
      visibleIds === null
        ? null
        : visibleIds.filter((id) => id !== actorEmployeeId);

    if (employeeIds !== null && employeeIds.length === 0) {
      return empty;
    }

    const empQb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.designationRef', 'designation')
      .where('e.status = :status', { status: EmployeeStatus.ACTIVE })
      .andWhere('e.id != :actorId', { actorId: actorEmployeeId });

    if (employeeIds !== null) {
      empQb.andWhere('e.id IN (:...employeeIds)', { employeeIds });
    }

    const employees = await empQb.orderBy('e.name', 'ASC').getMany();
    if (employees.length === 0) {
      return empty;
    }

    const ids = employees.map((e) => e.id);

    const employments = await dataSource
      .getRepository(EmployeeEmploymentDetail)
      .createQueryBuilder('ed')
      .leftJoinAndSelect('ed.employee', 'employee')
      .where('employee.id IN (:...ids)', { ids })
      .getMany();
    const employmentByEmployeeId = new Map(
      employments.map((row) => [row.employee?.id ?? '', row]),
    );

    const locationByEmployeeId = new Map<string, string | null>();
    for (const emp of employees) {
      const employment = employmentByEmployeeId.get(emp.id) ?? null;
      const locationId = await resolveEmployeeLocationId(
        dataSource,
        organizationId,
        employment?.businessUnit,
      );
      locationByEmployeeId.set(emp.id, locationId);
    }

    const locationIds = [
      ...new Set(
        [...locationByEmployeeId.values()].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    const locations =
      locationIds.length > 0
        ? await dataSource.getRepository(LocationConfiguration).find({
            where: { id: In(locationIds) },
          })
        : [];
    const locationNameById = new Map(
      locations.map((l) => [l.id, l.name ?? '—']),
    );

    const summaries = await dataSource
      .getRepository(AttendanceDailySummary)
      .find({
        where: {
          organizationId,
          workDate,
          employeeId: In(ids),
        },
        relations: ['shiftConfiguration'],
      });
    const summaryByEmployeeId = new Map(
      summaries.map((s) => [s.employeeId, s]),
    );

    const leaveRows = await findLeaveRequestsOverlappingRange(dataSource, {
      organizationId,
      employeeIds: ids,
      rangeStart: workDate,
      rangeEnd: workDate,
      statuses: [LeaveRequestStatus.APPROVED],
      relations: ['leaveConfiguration'],
    });
    const leaveByEmployeeId = new Map<
      string,
      (typeof leaveRows)[number]
    >();
    for (const row of leaveRows) {
      if (!leaveByEmployeeId.has(row.employeeId)) {
        leaveByEmployeeId.set(row.employeeId, row);
      }
    }

    const holidays = await this.calendarQuery.findPublishedHolidaysInRange(
      dataSource,
      {
        organizationId,
        fromDate: workDate,
        toDate: workDate,
        locationId: null,
      },
    );

    const notYetIn: ReturnType<typeof mapPersonBase>[] = [];
    const lateArrivals: Array<
      ReturnType<typeof mapPersonBase> & {
        firstIn: string | null;
        lateInMinutes: number;
      }
    > = [];
    const onTime: Array<
      ReturnType<typeof mapPersonBase> & { firstIn: string | null }
    > = [];
    const onLeave: Array<
      ReturnType<typeof mapPersonBase> & {
        daysCount: number;
        leaveDates: string;
        leaveType: string;
        status: string;
        shiftName: string | null;
        shiftTime: string | null;
      }
    > = [];
    const holidayPeople: ReturnType<typeof mapPersonBase>[] = [];
    const offDay: ReturnType<typeof mapPersonBase>[] = [];
    const restDay: ReturnType<typeof mapPersonBase>[] = [];

    for (const emp of employees) {
      const locationId = locationByEmployeeId.get(emp.id) ?? null;
      const locationName = locationId
        ? (locationNameById.get(locationId) ?? null)
        : (employmentByEmployeeId.get(emp.id)?.workLocation ?? null);
      const summary = summaryByEmployeeId.get(emp.id);
      const shift = summary?.shiftConfiguration;
      const shiftName = shift?.name ?? null;
      const shiftTime =
        shift?.startTime && shift?.endTime
          ? `${shift.startTime} - ${shift.endTime}`
          : null;

      const base = mapPersonBase(emp, {
        designation: emp.designationRef?.name ?? null,
        location: locationName,
        email: emp.email ?? emp.officialEmail ?? null,
        phone: emp.phoneNumber ?? emp.alternateMobile ?? null,
        shiftName,
        shiftTime,
      });

      const leave = leaveByEmployeeId.get(emp.id);
      if (leave) {
        const start = toDateKey(leave.startDate);
        const end = toDateKey(leave.endDate);
        onLeave.push({
          ...base,
          daysCount: Number(leave.daysCount),
          leaveDates: formatLeaveDatesLabel(start, end),
          leaveType: leave.leaveConfiguration?.name ?? 'Leave',
          status: leave.status,
          shiftName,
          shiftTime,
        });
        continue;
      }

      const onHoliday = holidays.some((h) =>
        this.calendarQuery.appliesToLocation(h, locationId),
      );
      if (onHoliday) {
        holidayPeople.push(base);
        continue;
      }

      if (
        summary?.status === AttendanceDayStatus.R ||
        isRestDay(workDate, policy.workingDays)
      ) {
        restDay.push(base);
        continue;
      }

      if (!summary?.firstIn) {
        notYetIn.push(base);
        continue;
      }

      const firstInIso =
        summary.firstIn instanceof Date
          ? summary.firstIn.toISOString()
          : String(summary.firstIn);
      const firstInLabel = formatTimeInOrg(
        summary.firstIn instanceof Date
          ? summary.firstIn
          : new Date(summary.firstIn),
        policy.timezone,
      );

      if (Number(summary.lateInMinutes) > 0) {
        lateArrivals.push({
          ...base,
          firstIn: firstInLabel || firstInIso,
          lateInMinutes: Number(summary.lateInMinutes),
        });
      } else {
        onTime.push({
          ...base,
          firstIn: firstInLabel || firstInIso,
        });
      }
    }

    const outOfOfficeCount =
      onLeave.length + holidayPeople.length + offDay.length + restDay.length;
    const total =
      notYetIn.length +
      lateArrivals.length +
      onTime.length +
      outOfOfficeCount;

    const pct = (n: number) =>
      total === 0 ? 0 : Math.round((n / total) * 100);

    return {
      date: workDate,
      timezone: policy.timezone,
      summary: {
        notYetIn: notYetIn.length,
        late: lateArrivals.length,
        onTime: onTime.length,
        outOfOffice: outOfOfficeCount,
        total,
        percentNotYetIn: pct(notYetIn.length),
        percentLate: pct(lateArrivals.length),
        percentOnTime: pct(onTime.length),
        percentOutOfOffice: pct(outOfOfficeCount),
      },
      notYetIn,
      lateArrivals,
      onTime,
      outOfOffice: {
        onLeave,
        holiday: holidayPeople,
        offDay,
        restDay,
      },
    };
  }
}

function emptyWhoIsInPayload(date: string | null, timezone?: string) {
  return {
    date: date ?? '',
    timezone: timezone ?? '',
    summary: {
      notYetIn: 0,
      late: 0,
      onTime: 0,
      outOfOffice: 0,
      total: 0,
      percentNotYetIn: 0,
      percentLate: 0,
      percentOnTime: 0,
      percentOutOfOffice: 0,
    },
    notYetIn: [] as ReturnType<typeof mapPersonBase>[],
    lateArrivals: [] as Array<
      ReturnType<typeof mapPersonBase> & {
        firstIn: string | null;
        lateInMinutes: number;
      }
    >,
    onTime: [] as Array<
      ReturnType<typeof mapPersonBase> & { firstIn: string | null }
    >,
    outOfOffice: {
      onLeave: [] as Array<
        ReturnType<typeof mapPersonBase> & {
          daysCount: number;
          leaveDates: string;
          leaveType: string;
          status: string;
          shiftName: string | null;
          shiftTime: string | null;
        }
      >,
      holiday: [] as ReturnType<typeof mapPersonBase>[],
      offDay: [] as ReturnType<typeof mapPersonBase>[],
      restDay: [] as ReturnType<typeof mapPersonBase>[],
    },
  };
}

function mapPersonBase(
  emp: Employee,
  extra: {
    designation: string | null;
    location: string | null;
    email: string | null;
    phone: string | null;
    shiftName: string | null;
    shiftTime: string | null;
  },
) {
  const name = emp.name ?? 'Employee';
  return {
    employeeId: emp.id,
    name,
    employeeCode: emp.employeeCode ?? '',
    initials: whoIsInInitials(name),
    designation: extra.designation,
    location: extra.location,
    email: extra.email,
    phone: extra.phone,
    shiftName: extra.shiftName,
    shiftTime: extra.shiftTime,
  };
}

function whoIsInInitials(name: string): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatLeaveDatesLabel(start: string, end: string): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const fmt = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${months[(m ?? 1) - 1]} ${y}`;
  };
  if (start === end) return fmt(start);
  const [, sm] = start.split('-');
  const [, em, ed] = end.split('-');
  if (sm === em && start.slice(0, 4) === end.slice(0, 4)) {
    const sd = Number(start.slice(8, 10));
    return `${String(sd).padStart(2, '0')}-${String(ed).padStart(2, '0')} ${months[Number(sm) - 1]} ${start.slice(0, 4)}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatSwipeTimeWithSeconds(
  value: Date,
  timezone?: string | null,
): string {
  const tz = resolveOrgTimezone(timezone);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);
}

function mapSwipeRow(
  punch: AttendancePunch,
  opts: { timezone: string; shiftName: string | null },
) {
  const emp = punch.employee;
  const name = emp?.name ?? 'Employee';
  const punchType = punch.punchType;
  const isIn = punchType === AttendancePunchType.IN;
  const sourceLabel =
    String(punch.source ?? 'WEB').toUpperCase() === 'WEB'
      ? isIn
        ? 'Web sign in'
        : 'Web sign out'
      : isIn
        ? 'Sign in'
        : 'Sign out';

  const punchedAt =
    punch.punchedAt instanceof Date
      ? punch.punchedAt
      : new Date(punch.punchedAt);
  const receivedAt =
    punch.createdAt instanceof Date
      ? punch.createdAt
      : new Date(punch.createdAt);

  return {
    id: punch.id,
    employeeId: punch.employeeId,
    name,
    employeeCode: emp?.employeeCode ?? '',
    initials: whoIsInInitials(name),
    punchedAt: punchedAt.toISOString(),
    swipeTime: formatSwipeTimeWithSeconds(punchedAt, opts.timezone),
    swipeDate: formatDateInOrg(punchedAt, opts.timezone),
    receivedAt: receivedAt.toISOString(),
    receivedTime: formatSwipeTimeWithSeconds(receivedAt, opts.timezone),
    receivedDate: formatDateInOrg(receivedAt, opts.timezone),
    punchType,
    source: punch.source ?? 'WEB',
    sourceLabel,
    shiftName: opts.shiftName,
    doorAddress: null as string | null,
    deviceName: null as string | null,
    accessCard: null as string | null,
    remarks: null as string | null,
    deviceId: null as string | null,
    locationSummary: isIn
      ? signInLocationLabel(punch.signInLocation)
      : null,
  };
}

function signInLocationLabel(code?: string | null): string | null {
  if (!code) return null;
  return SIGN_IN_LOCATION_LABELS[code as SignInLocationCode] ?? code;
}

function csvEscape(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
