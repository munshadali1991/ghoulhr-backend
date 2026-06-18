import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Between, EntityManager, IsNull } from 'typeorm';
import { SettingsService } from '../../settings/settings.service';
import {
  TimesheetDay,
  TimesheetDayStatus,
} from '../entities/timesheet-day.entity';
import { TimesheetEntry } from '../entities/timesheet-entry.entity';
import {
  DEFAULT_TIMESHEET_SETTINGS,
  TIMESHEET_EDITABLE_STATUSES,
} from './timesheet.constants';
import { TimesheetEntryDto } from './dto/timesheet-entry.dto';
import { UpsertTimesheetDayDto } from './dto/upsert-timesheet-day.dto';
import { TimesheetReportQueryDto } from './dto/timesheet-report-query.dto';
import { TimesheetEntryReportQueryDto } from './dto/timesheet-entry-report-query.dto';
import { EssAttendanceService } from '../attendance/ess-attendance.service';
import { TimesheetCategoryService } from '../../settings/timesheet-category.service';
import { TimesheetCategory } from '../entities/timesheet-category.entity';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { AuthorizationService } from '../../rbac/authorization.service';

function parseDateKey(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function sumHours(entries: { hoursSpent: number }[]): number {
  return entries.reduce((acc, e) => acc + Number(e.hoursSpent), 0);
}

@Injectable()
export class EssTimesheetService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly attendanceService: EssAttendanceService,
    private readonly categoryService: TimesheetCategoryService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async getCategories(dataSource: DataSource, organizationId: string) {
    return this.categoryService.listActiveCategories(dataSource, organizationId);
  }

  async getSettings(dataSource: DataSource): Promise<Record<string, unknown>> {
    return this.settingsService.getTimesheetSettings(dataSource);
  }

  private async resolveSettings(dataSource: DataSource) {
    const raw = await this.getSettings(dataSource);
    return {
      maxHoursPerDay: Number(raw.max_hours_per_day ?? DEFAULT_TIMESHEET_SETTINGS.max_hours_per_day),
      maxPastDays: Number(raw.max_past_days ?? DEFAULT_TIMESHEET_SETTINGS.max_past_days),
      requireSubmissionByEod: Boolean(
        raw.require_submission_by_eod ?? DEFAULT_TIMESHEET_SETTINGS.require_submission_by_eod,
      ),
      employeeHelperText: String(raw.employee_helper_text ?? ''),
      weekStartsOn: Number(raw.week_starts_on ?? DEFAULT_TIMESHEET_SETTINGS.week_starts_on),
    };
  }

  assertDateAllowed(workDate: string, settings: { maxPastDays: number }) {
    const today = this.attendanceService.todayLocalDateKey();
    if (workDate > today) {
      throw new BadRequestException('Future dates are not allowed.');
    }
    const earliest = addDays(today, -settings.maxPastDays);
    if (workDate < earliest) {
      throw new BadRequestException(
        `Work date must be within the last ${settings.maxPastDays} day(s).`,
      );
    }
  }

  private mapEntryToApi(entry: TimesheetEntry) {
    return {
      id: entry.id,
      projectName: entry.projectName,
      taskName: entry.taskName,
      taskDescription: entry.taskDescription,
      categoryId: entry.categoryId,
      categoryName: entry.category?.name ?? null,
      hoursSpent: Number(entry.hoursSpent),
      taskStatus: entry.taskStatus,
      priority: entry.priority,
      blockerNotes: entry.blockerNotes ?? null,
      sortOrder: entry.sortOrder,
    };
  }

  private async resolveCategoryForEntry(
    em: EntityManager,
    organizationId: string,
    categoryId: string,
  ): Promise<TimesheetCategory> {
    const repo = em.getRepository(TimesheetCategory);
    const category = await repo.findOne({
      where: {
        id: categoryId,
        organizationId,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
    if (!category) {
      throw new BadRequestException('Invalid or inactive timesheet category.');
    }
    return category;
  }

  private mapDayToApi(day: TimesheetDay, settings: Record<string, unknown>) {
    const entries = (day.entries ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((e) => this.mapEntryToApi(e));

    return {
      id: day.id,
      workDate: day.workDate,
      status: day.status,
      totalHours: Number(day.totalHours),
      submittedAt: day.submittedAt?.toISOString() ?? null,
      approvedAt: day.approvedAt?.toISOString() ?? null,
      rejectedAt: day.rejectedAt?.toISOString() ?? null,
      rejectionReason: day.rejectionReason ?? null,
      entries,
      editable: TIMESHEET_EDITABLE_STATUSES.includes(day.status),
      canReopen: day.status === TimesheetDayStatus.SUBMITTED,
      settings: {
        maxHoursPerDay: settings.maxHoursPerDay,
        maxPastDays: settings.maxPastDays,
        employeeHelperText: settings.employeeHelperText,
      },
    };
  }

  async getDay(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    workDate: string,
  ) {
    const settings = await this.resolveSettings(dataSource);
    const repo = dataSource.getRepository(TimesheetDay);
    const day = await repo.findOne({
      where: { organizationId, employeeId, workDate },
      relations: ['entries', 'entries.category'],
    });

    if (!day) {
      return {
        id: null,
        workDate,
        status: null,
        totalHours: 0,
        entries: [],
        editable: true,
        isMissing: true,
        settings: {
          maxHoursPerDay: settings.maxHoursPerDay,
          maxPastDays: settings.maxPastDays,
          employeeHelperText: settings.employeeHelperText,
        },
      };
    }

    return { ...this.mapDayToApi(day, settings), isMissing: false };
  }

  async upsertDay(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    workDate: string,
    dto: UpsertTimesheetDayDto,
  ) {
    const settings = await this.resolveSettings(dataSource);
    this.assertDateAllowed(workDate, settings);

    if (
      dto.status !== TimesheetDayStatus.DRAFT &&
      dto.status !== TimesheetDayStatus.SUBMITTED
    ) {
      throw new BadRequestException('Status must be DRAFT or SUBMITTED.');
    }

    const total = sumHours(dto.entries);

    if (dto.status === TimesheetDayStatus.SUBMITTED) {
      if (dto.entries.length === 0) {
        throw new BadRequestException('At least one entry is required to submit.');
      }
      if (total > settings.maxHoursPerDay) {
        throw new BadRequestException(
          `Total hours (${total}) exceed the daily limit of ${settings.maxHoursPerDay} hours.`,
        );
      }
    }

    return dataSource.transaction(async (em) => {
      const dayRepo = em.getRepository(TimesheetDay);
      const entryRepo = em.getRepository(TimesheetEntry);

      let day = await dayRepo.findOne({
        where: { organizationId, employeeId, workDate },
        relations: ['entries'],
      });

      if (day && !TIMESHEET_EDITABLE_STATUSES.includes(day.status)) {
        throw new ForbiddenException('This timesheet cannot be edited.');
      }

      if (!day) {
        day = dayRepo.create({
          organizationId,
          employeeId,
          workDate,
          status: TimesheetDayStatus.DRAFT,
          totalHours: '0',
        });
      }

      if (day.status === TimesheetDayStatus.REJECTED) {
        day.status = TimesheetDayStatus.DRAFT;
        day.rejectionReason = null;
        day.rejectedAt = null;
      }

      day.status = dto.status;
      day.totalHours = total.toFixed(2);

      if (dto.status === TimesheetDayStatus.SUBMITTED) {
        day.submittedAt = new Date();
      } else {
        day.submittedAt = null;
      }

      day = await dayRepo.save(day);

      await entryRepo.delete({ timesheetDayId: day.id });

      let order = 0;
      for (const item of dto.entries) {
        await this.resolveCategoryForEntry(em, organizationId, item.categoryId);
        await entryRepo.save(
          entryRepo.create({
            timesheetDayId: day.id,
            categoryId: item.categoryId,
            projectName: item.projectName.trim(),
            taskName: item.taskName.trim(),
            taskDescription: item.taskDescription.trim(),
            hoursSpent: Number(item.hoursSpent).toFixed(2),
            taskStatus: item.taskStatus,
            priority: item.priority,
            blockerNotes: item.blockerNotes?.trim() || null,
            sortOrder: order++,
          }),
        );
      }

      const saved = await dayRepo.findOne({
        where: { id: day.id },
        relations: ['entries', 'entries.category'],
      });

      return this.mapDayToApi(saved!, settings);
    });
  }

  async reopenDay(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    workDate: string,
  ) {
    const settings = await this.resolveSettings(dataSource);
    this.assertDateAllowed(workDate, settings);

    const repo = dataSource.getRepository(TimesheetDay);
    const day = await repo.findOne({
      where: { organizationId, employeeId, workDate },
      relations: ['entries'],
    });

    if (!day) {
      throw new BadRequestException('No timesheet found for this date.');
    }

    if (day.status === TimesheetDayStatus.APPROVED) {
      throw new ForbiddenException('Approved timesheets cannot be edited.');
    }

    if (day.status !== TimesheetDayStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted timesheets can be reopened. This timesheet is already editable.',
      );
    }

    day.status = TimesheetDayStatus.DRAFT;
    day.submittedAt = null;
    await repo.save(day);

    const refreshed = await repo.findOne({
      where: { id: day.id },
      relations: ['entries'],
    });

    return { ...this.mapDayToApi(refreshed!, settings), isMissing: false };
  }

  async getTodaySnapshot(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const workDate = this.attendanceService.todayLocalDateKey();
    const settings = await this.resolveSettings(dataSource);
    const repo = dataSource.getRepository(TimesheetDay);
    const day = await repo.findOne({
      where: { organizationId, employeeId, workDate },
      relations: ['entries'],
    });

    if (!day) {
      return {
        workDate,
        totalHours: 0,
        status: null,
        entryCount: 0,
        isMissing: true,
        requireSubmissionByEod: settings.requireSubmissionByEod,
        showReminder: settings.requireSubmissionByEod,
      };
    }

    const isSubmittedOrBeyond =
      day.status === TimesheetDayStatus.SUBMITTED ||
      day.status === TimesheetDayStatus.APPROVED;

    return {
      workDate,
      totalHours: Number(day.totalHours),
      status: day.status,
      entryCount: day.entries?.length ?? 0,
      isMissing: false,
      requireSubmissionByEod: settings.requireSubmissionByEod,
      showReminder: settings.requireSubmissionByEod && !isSubmittedOrBeyond,
    };
  }

  async getReports(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    query: TimesheetReportQueryDto,
  ) {
    const settings = await this.resolveSettings(dataSource);
    const repo = dataSource.getRepository(TimesheetDay);
    const days = await repo.find({
      where: {
        organizationId,
        employeeId,
        workDate: Between(query.from, query.to),
      },
      order: { workDate: 'ASC' },
    });

    const dayRows = days.map((d) => ({
      workDate: d.workDate,
      totalHours: Number(d.totalHours),
      status: d.status,
      entryCount: 0,
    }));

    const totalHours = dayRows.reduce((acc, d) => acc + d.totalHours, 0);
    const statusSummary: Record<string, number> = {};
    for (const d of dayRows) {
      const key = d.status ?? 'MISSING';
      statusSummary[key] = (statusSummary[key] ?? 0) + 1;
    }

    let series: { label: string; totalHours: number; days: typeof dayRows }[] = [];

    if (query.granularity === 'daily') {
      series = dayRows.map((d) => ({
        label: d.workDate,
        totalHours: d.totalHours,
        days: [d],
      }));
    } else if (query.granularity === 'weekly') {
      const buckets = new Map<string, typeof dayRows>();
      for (const row of dayRows) {
        const d = parseDateKey(row.workDate);
        const dayOfWeek = d.getDay();
        const diff = (dayOfWeek - settings.weekStartsOn + 7) % 7;
        const weekStart = addDays(row.workDate, -diff);
        const bucket = buckets.get(weekStart) ?? [];
        bucket.push(row);
        buckets.set(weekStart, bucket);
      }
      series = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, rows]) => ({
          label: weekStart,
          totalHours: rows.reduce((acc, r) => acc + r.totalHours, 0),
          days: rows,
        }));
    } else {
      const buckets = new Map<string, typeof dayRows>();
      for (const row of dayRows) {
        const monthKey = row.workDate.slice(0, 7);
        const bucket = buckets.get(monthKey) ?? [];
        bucket.push(row);
        buckets.set(monthKey, bucket);
      }
      series = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, rows]) => ({
          label: monthKey,
          totalHours: rows.reduce((acc, r) => acc + r.totalHours, 0),
          days: rows,
        }));
    }

    return {
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      totalHours,
      statusSummary,
      days: dayRows,
      series,
      settings: {
        maxHoursPerDay: settings.maxHoursPerDay,
        weekStartsOn: settings.weekStartsOn,
      },
    };
  }

  async getReportEntries(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    query: TimesheetEntryReportQueryDto,
  ) {
    if (query.from > query.to) {
      throw new BadRequestException('"from" must be on or before "to".');
    }

    const repo = dataSource.getRepository(TimesheetDay);
    const days = await repo.find({
      where: {
        organizationId,
        employeeId,
        workDate: Between(query.from, query.to),
      },
      relations: ['entries', 'entries.category'],
      order: { workDate: 'DESC' },
    });

    const rows: {
      workDate: string;
      dayStatus: string;
      editable: boolean;
      canReopen: boolean;
      entry: ReturnType<typeof this.mapEntryToApi>;
    }[] = [];

    for (const day of days) {
      const sorted = (day.entries ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
      for (const entry of sorted) {
        rows.push({
          workDate: day.workDate,
          dayStatus: day.status,
          editable: TIMESHEET_EDITABLE_STATUSES.includes(day.status),
          canReopen: day.status === TimesheetDayStatus.SUBMITTED,
          entry: this.mapEntryToApi(entry),
        });
      }
    }

    return {
      from: query.from,
      to: query.to,
      totalEntries: rows.length,
      totalHours: rows.reduce((acc, r) => acc + r.entry.hoursSpent, 0),
      rows,
    };
  }

  async listPendingApprovals(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ) {
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      'approvals.timesheet:read',
      auth,
    );

    const qb = dataSource
      .getRepository(TimesheetDay)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.employee', 'employee')
      .where('d.organizationId = :organizationId', { organizationId })
      .andWhere('d.status = :status', { status: TimesheetDayStatus.SUBMITTED });

    if (visibleIds) {
      qb.andWhere('d.employeeId IN (:...visibleIds)', { visibleIds });
    }

    const days = await qb.orderBy('d.workDate', 'DESC').getMany();

    return days.map((day) => ({
      id: day.id,
      workDate: day.workDate,
      status: day.status,
      totalHours: Number(day.totalHours),
      employeeId: day.employeeId,
      employeeName: day.employee?.name,
      submittedAt: day.submittedAt?.toISOString() ?? null,
    }));
  }

  async approveTimesheetDay(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dayId: string,
  ) {
    const day = await this.getApprovableDay(
      dataSource,
      organizationId,
      approverEmployeeId,
      dayId,
    );

    day.status = TimesheetDayStatus.APPROVED;
    day.approvedAt = new Date();
    day.approverEmployeeId = approverEmployeeId;
    day.rejectedAt = null;
    day.rejectionReason = null;
    await dataSource.getRepository(TimesheetDay).save(day);
    return { success: true, status: day.status };
  }

  async rejectTimesheetDay(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dayId: string,
    reason?: string,
  ) {
    const day = await this.getApprovableDay(
      dataSource,
      organizationId,
      approverEmployeeId,
      dayId,
    );

    day.status = TimesheetDayStatus.REJECTED;
    day.rejectedAt = new Date();
    day.approverEmployeeId = approverEmployeeId;
    day.rejectionReason = reason?.trim() || null;
    await dataSource.getRepository(TimesheetDay).save(day);
    return { success: true, status: day.status };
  }

  private async getApprovableDay(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dayId: string,
  ): Promise<TimesheetDay> {
    const day = await dataSource.getRepository(TimesheetDay).findOne({
      where: { id: dayId, organizationId },
      relations: ['employee'],
    });

    if (!day || day.status !== TimesheetDayStatus.SUBMITTED) {
      throw new NotFoundException('Submitted timesheet day not found');
    }

    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      'approvals.timesheet:act',
      auth,
    );

    if (visibleIds && !visibleIds.includes(day.employeeId)) {
      throw new ForbiddenException('You cannot act on this timesheet');
    }

    return day;
  }
}
