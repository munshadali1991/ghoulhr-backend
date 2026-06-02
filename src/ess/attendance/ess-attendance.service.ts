import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Between } from 'typeorm';
import { WorkShiftConfiguration } from '../../employees/entities/work-shift-configuration.entity';
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
  daysInMonth,
  formatDateKey,
  formatHomeDate,
  formatMinutesAsHhMm,
  formatTimeOrDash,
  isWeekend,
} from '../shared/ess-format.util';

@Injectable()
export class EssAttendanceService {
  constructor(private readonly policyService: LeavePolicyService) {}

  todayLocalDateKey(): string {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Inclusive local-day window for YYYY-MM-DD (matches todayLocalDateKey()).
   * Avoids UTC midnight bounds that miss punches near timezone boundaries.
   */
  private dayBoundsLocal(workDate: string): { start: Date; end: Date } {
    const [y, m, d] = workDate.split('-').map((part) => Number(part));
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { start, end };
  }

  async isSignedIn(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ): Promise<boolean> {
    const workDate = this.todayLocalDateKey();
    const punches = await this.getPunchesForDay(
      dataSource,
      organizationId,
      employeeId,
      workDate,
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
    const workDate = this.todayLocalDateKey();
    return dataSource.transaction(async (em) => {
      const punches = await this.getPunchesForDay(
        em,
        organizationId,
        employeeId,
        workDate,
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

      const shift = await this.resolveDefaultShift(em, organizationId, employeeId);
      await this.recomputeDailySummary(
        em,
        organizationId,
        employeeId,
        workDate,
        shift?.id ?? null,
        shift?.breakMinutes ?? 0,
      );

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
    const workDate = this.todayLocalDateKey();
    return dataSource.transaction(async (em) => {
      const punches = await this.getPunchesForDay(
        em,
        organizationId,
        employeeId,
        workDate,
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
      const breakMinutes = summary?.shiftConfiguration?.breakMinutes ?? 0;
      await this.recomputeDailySummary(
        em,
        organizationId,
        employeeId,
        workDate,
        summary?.shiftConfigurationId ?? null,
        breakMinutes,
      );

      return { signedIn: false, punchedAt: now.toISOString() };
    });
  }

  async getTodayStatus(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const workDate = this.todayLocalDateKey();
    const signedIn = await this.isSignedIn(
      dataSource,
      organizationId,
      employeeId,
    );
    const shift = await this.resolveDefaultShift(
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
        (s) => s.status === AttendanceDayStatus.A && !isWeekend(s.workDate),
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
    /** @type {Record<string, object>} */
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
      } else if (isWeekend(key)) {
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
    const summary = await dataSource
      .getRepository(AttendanceDailySummary)
      .findOne({
        where: { organizationId, employeeId, workDate: date },
        relations: ['shiftConfiguration', 'sessions'],
      });

    if (!summary) {
      const shift = await this.resolveDefaultShift(
        dataSource,
        organizationId,
        employeeId,
      );
      return this.emptyDayDetail(date, shift);
    }

    const shift = summary.shiftConfiguration;
    const shiftName = shift?.name ?? '—';
    const shiftTime = shift
      ? `${shift.startTime} to ${shift.endTime}`
      : '—';

    const sessions = (summary.sessions ?? []).map((s) => ({
      session: s.sessionLabel,
      timing:
        s.sessionStart && s.sessionEnd
          ? `${formatTimeOrDash(s.sessionStart)} - ${formatTimeOrDash(s.sessionEnd)}`
          : '—',
      firstIn: formatTimeOrDash(s.firstIn),
      lastOut: formatTimeOrDash(s.lastOut),
    }));

    return {
      date,
      shiftName: shift ? `${shiftName}(${shiftName.replace(/\s/g, '').slice(0, 4)})` : shiftName,
      shiftTime,
      scheme: shift ? `${shift.name} scheme Attendance Scheme` : '—',
      firstIn: formatTimeOrDash(summary.firstIn),
      lastOut: formatTimeOrDash(summary.lastOut),
      lateIn: summary.lateInMinutes > 0 ? String(summary.lateInMinutes) : '-',
      earlyOut: summary.earlyOutMinutes > 0 ? String(summary.earlyOutMinutes) : '-',
      totalWorkHrs: formatMinutesAsHhMm(summary.totalWorkMinutes),
      breakHrs: formatMinutesAsHhMm(summary.breakMinutes),
      actualWork: formatMinutesAsHhMm(summary.actualWorkMinutes),
      status: summary.status,
      remarks: summary.remarks ?? '-',
      sessions,
    };
  }

  private emptyDayDetail(date: string, shift?: WorkShiftConfiguration | null) {
    return {
      date,
      shiftName: shift?.name ?? '—',
      shiftTime: shift ? `${shift.startTime} to ${shift.endTime}` : '—',
      scheme: shift ? `${shift.name} scheme Attendance Scheme` : '—',
      firstIn: '-',
      lastOut: '-',
      lateIn: '-',
      earlyOut: '-',
      totalWorkHrs: '-',
      breakHrs: '-',
      actualWork: '-',
      status: '-',
      remarks: '-',
      sessions: [],
    };
  }

  private async getPunchesForDay(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
    workDate: string,
  ): Promise<AttendancePunch[]> {
    const { start, end } = this.dayBoundsLocal(workDate);
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
    shiftConfigurationId: string | null,
    breakMinutes: number,
  ) {
    const punches = await this.getPunchesForDay(
      em,
      organizationId,
      employeeId,
      workDate,
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
    const lastOut =
      pairs.filter((p) => p.out).length > 0
        ? pairs.filter((p) => p.out).at(-1)!.out!
        : null;

    let totalWorkMinutes = 0;
    pairs.forEach((pair, idx) => {
      if (pair.out) {
        totalWorkMinutes += Math.max(
          0,
          Math.round((pair.out.getTime() - pair.in.getTime()) / 60000),
        );
      }
    });

    const actualWorkMinutes = Math.max(0, totalWorkMinutes - breakMinutes);
    const weekend = isWeekend(workDate);
    let status = AttendanceDayStatus.A;
    if (weekend) {
      status = AttendanceDayStatus.R;
    } else if (firstIn) {
      status = AttendanceDayStatus.P;
    }

    const exceptionFlag =
      !weekend && (status === AttendanceDayStatus.A || !lastOut);

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
    summary.shiftConfigurationId = shiftConfigurationId;
    summary.firstIn = firstIn;
    summary.lastOut = lastOut;
    summary.totalWorkMinutes = totalWorkMinutes;
    summary.breakMinutes = breakMinutes;
    summary.actualWorkMinutes = actualWorkMinutes;
    summary.exceptionFlag = exceptionFlag;
    summary.lateInMinutes = 0;
    summary.earlyOutMinutes = 0;
    summary.remarks = exceptionFlag ? 'Exception' : null;

    summary = await repo.save(summary);

    await em.getRepository(AttendanceSession).delete({
      dailySummaryId: summary.id,
    });

    const sessionEntities = pairs.map((pair, idx) =>
      em.getRepository(AttendanceSession).create({
        dailySummaryId: summary!.id,
        sessionLabel: `Session ${idx + 1}`,
        sessionStart: pair.in,
        sessionEnd: pair.out ?? null,
        firstIn: pair.in,
        lastOut: pair.out ?? null,
      }),
    );
    if (sessionEntities.length > 0) {
      await em.getRepository(AttendanceSession).save(sessionEntities);
    }

    return summary;
  }

  private async resolveDefaultShift(
    em: DataSource | import('typeorm').EntityManager,
    organizationId: string,
    employeeId: string,
  ): Promise<WorkShiftConfiguration | null> {
    const { locationId } = await this.policyService.getEmployeeContext(
      em as DataSource,
      organizationId,
      employeeId,
    );
    if (!locationId) return null;
    return em.getRepository(WorkShiftConfiguration).findOne({
      where: { locationId },
      order: { sortOrder: 'ASC' },
    });
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
