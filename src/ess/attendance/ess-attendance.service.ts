import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, Between, In } from 'typeorm';
import { WorkShiftConfiguration } from '../../employees/entities/work-shift-configuration.entity';
import { WorkShiftSession } from '../../employees/entities/work-shift-session.entity';
import { LocationConfiguration } from '../../employees/entities/location-configuration.entity';
import { OrganizationSetting } from '../../settings/entities/organization-setting.entity';
import { SETTING_KEYS, VALID_WEEKDAYS } from '../../settings/settings.constants';
import {
  AttendancePunch,
  AttendancePunchType,
} from '../entities/attendance-punch.entity';
import {
  AttendanceDailySummary,
  AttendanceDayStatus,
} from '../entities/attendance-daily-summary.entity';
import { AttendanceSession } from '../entities/attendance-session.entity';
import { LeavePolicyService } from '../leave/leave-policy.service';
import {
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
  isRestDay,
  matchShiftByName,
  resolveShiftEndDate,
  shouldFlagAttendanceException,
} from '../shared/attendance-shift.util';
import {
  daysInMonth,
  formatHomeDate,
} from '../shared/ess-format.util';

type ShiftSessionDef = {
  sessionLabel: string;
  startTime: string;
  endTime: string;
};

@Injectable()
export class EssAttendanceService {
  constructor(private readonly policyService: LeavePolicyService) {}

  todayLocalDateKey(timezone?: string | null): string {
    return orgDateKeyForInstant(new Date(), timezone);
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
  ) {
    return dataSource.transaction(async (em) => {
      const { timezone } = await this.loadAttendancePolicy(em);
      const workDate = this.todayLocalDateKey(timezone);
      const shift = await this.requireEmployeeShift(em, organizationId, employeeId);

      const punches = await this.getPunchesForDay(
        em,
        organizationId,
        employeeId,
        workDate,
        timezone,
      );
      if (this.hasOpenSession(punches)) {
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
  ) {
    return dataSource.transaction(async (em) => {
      const { timezone } = await this.loadAttendancePolicy(em);
      const workDate = this.todayLocalDateKey(timezone);
      const punches = await this.getPunchesForDay(
        em,
        organizationId,
        employeeId,
        workDate,
        timezone,
      );
      if (!this.hasOpenSession(punches)) {
        throw new BadRequestException('You are not signed in');
      }

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
        }),
      );

      const summary = await em.getRepository(AttendanceDailySummary).findOne({
        where: { organizationId, employeeId, workDate },
        relations: ['shiftConfiguration'],
      });
      let shift = summary?.shiftConfiguration ?? null;
      if (!shift && summary?.shiftConfigurationId) {
        shift = await em.getRepository(WorkShiftConfiguration).findOne({
          where: { id: summary.shiftConfigurationId },
        });
      }
      if (!shift) {
        shift = await this.requireEmployeeShift(em, organizationId, employeeId);
      }

      await this.recomputeDailySummary(em, organizationId, employeeId, workDate, shift);

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

    const punches = await this.getPunchesForDay(
      dataSource,
      organizationId,
      employeeId,
      date,
      timezone,
    );

    const summaryRepo = dataSource.getRepository(AttendanceDailySummary);
    let existingSummary = await summaryRepo.findOne({
      where: { organizationId, employeeId, workDate: date },
      relations: ['shiftConfiguration'],
    });

    const shiftForRecompute =
      existingSummary?.shiftConfiguration ?? ctx.shift ?? null;

    if (punches.length > 0 && shiftForRecompute) {
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

    const swipes = punches.map((p) => ({
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
  ): Promise<AttendancePunch[]> {
    const { start, end } = this.dayBoundsLocal(workDate, timezone);
    return em.getRepository(AttendancePunch).find({
      where: {
        organizationId,
        employeeId,
        punchedAt: Between(start, end),
      },
      order: { punchedAt: 'ASC' },
    });
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
    const punches = await this.getPunchesForDay(
      em,
      organizationId,
      employeeId,
      workDate,
      policy.timezone,
    );

    const pairs: { in: Date; out?: Date }[] = [];
    let currentIn: Date | null = null;
    for (const p of punches) {
      if (p.punchType === AttendancePunchType.IN) {
        currentIn = p.punchedAt;
      } else if (p.punchType === AttendancePunchType.OUT && currentIn) {
        pairs.push({ in: currentIn, out: p.punchedAt });
        currentIn = null;
      }
    }
    if (currentIn) {
      pairs.push({ in: currentIn });
    }

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
    const inPunches = punches.filter((p) => p.punchType === AttendancePunchType.IN);
    const outPunches = punches.filter((p) => p.punchType === AttendancePunchType.OUT);
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
}
