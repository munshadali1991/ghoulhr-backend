import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Between, EntityManager, IsNull } from 'typeorm';
import { Employee } from '../../employees/employee.entity';
import { Department } from '../../employees/entities/department.entity';
import { Designation } from '../../employees/entities/designation.entity';
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
import { TeamTimesheetQueryDto } from './dto/team-timesheet-query.dto';
import { BulkApproveTimesheetDto } from '../approvals/dto/bulk-approve-timesheet.dto';
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

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function minDateKey(a: string, b: string): string {
  return a <= b ? a : b;
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

  private async resolveEmployeeOrgLabels(
    dataSource: DataSource,
    employee?: Employee | null,
  ): Promise<{ departmentName?: string; designationName?: string }> {
    if (!employee) return {};

    let departmentName = employee.departmentRef?.name;
    let designationName = employee.designationRef?.name;

    if (!departmentName && employee.departmentId) {
      const dept = await dataSource.getRepository(Department).findOne({
        where: { id: employee.departmentId },
      });
      departmentName = dept?.name;
    }
    if (!designationName && employee.designationId) {
      const desig = await dataSource.getRepository(Designation).findOne({
        where: { id: employee.designationId },
      });
      designationName = desig?.name;
    }

    return { departmentName, designationName };
  }

  private async getVisibleEmployeeIdsForApprover(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    permission: string,
  ): Promise<string[] | null> {
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    return this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      permission,
      auth,
    );
  }

  private async getTimesheetDayForApproverRead(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dayId: string,
  ): Promise<TimesheetDay> {
    const day = await dataSource.getRepository(TimesheetDay).findOne({
      where: { id: dayId, organizationId },
      relations: ['employee', 'employee.departmentRef', 'employee.designationRef', 'entries', 'entries.category', 'approver'],
    });

    if (!day) {
      throw new NotFoundException('Timesheet day not found');
    }

    const visibleIds = await this.getVisibleEmployeeIdsForApprover(
      dataSource,
      organizationId,
      approverEmployeeId,
      'approvals.timesheet:read',
    );

    if (visibleIds && !visibleIds.includes(day.employeeId)) {
      throw new ForbiddenException('You cannot view this timesheet');
    }

    return day;
  }

  async countPendingApprovalsForApprover(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ): Promise<number> {
    const rows = await this.listPendingApprovals(
      dataSource,
      organizationId,
      approverEmployeeId,
    );
    return rows.length;
  }

  async getTimesheetApprovalDetail(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dayId: string,
  ) {
    const day = await this.getTimesheetDayForApproverRead(
      dataSource,
      organizationId,
      approverEmployeeId,
      dayId,
    );
    const settings = await this.resolveSettings(dataSource);
    const labels = await this.resolveEmployeeOrgLabels(dataSource, day.employee);

    const authContext = {
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    };
    const canActPermission = await this.authorizationService.hasPermission(
      authContext,
      'approvals.timesheet:act',
    );
    let canAct = canActPermission && day.status === TimesheetDayStatus.SUBMITTED;

    if (canAct) {
      const actVisibleIds = await this.getVisibleEmployeeIdsForApprover(
        dataSource,
        organizationId,
        approverEmployeeId,
        'approvals.timesheet:act',
      );
      if (actVisibleIds && !actVisibleIds.includes(day.employeeId)) {
        canAct = false;
      }
    }

    const mappedDay = this.mapDayToApi(day, settings);

    return {
      employee: {
        id: day.employeeId,
        name: day.employee?.name ?? 'Employee',
        employeeCode: day.employee?.employeeCode,
        departmentName: labels.departmentName,
        designationName: labels.designationName,
      },
      day: {
        ...mappedDay,
        approverName: day.approver?.name ?? null,
      },
      canAct,
    };
  }

  async listTeamTimesheetDays(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    query: TeamTimesheetQueryDto,
  ) {
    if (query.from > query.to) {
      throw new BadRequestException('"from" must be on or before "to".');
    }

    const visibleIds = await this.getVisibleEmployeeIdsForApprover(
      dataSource,
      organizationId,
      approverEmployeeId,
      'approvals.timesheet:read',
    );

    const actVisibleIds = await this.getVisibleEmployeeIdsForApprover(
      dataSource,
      organizationId,
      approverEmployeeId,
      'approvals.timesheet:act',
    );

    const authContext = {
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    };
    const canActPermission = await this.authorizationService.hasPermission(
      authContext,
      'approvals.timesheet:act',
    );

    if (query.employeeId) {
      if (visibleIds && !visibleIds.includes(query.employeeId)) {
        throw new ForbiddenException('You cannot view this employee\'s timesheets');
      }
    }

    const employeeQb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.organizationId = :organizationId', { organizationId });

    if (visibleIds) {
      employeeQb.andWhere('e.id IN (:...visibleIds)', { visibleIds });
    }
    if (query.employeeId) {
      employeeQb.andWhere('e.id = :employeeId', { employeeId: query.employeeId });
    }

    const employees = await employeeQb.orderBy('e.name', 'ASC').getMany();

    const dayQb = dataSource
      .getRepository(TimesheetDay)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.entries', 'entries')
      .where('d.organizationId = :organizationId', { organizationId })
      .andWhere('d.workDate BETWEEN :from AND :to', {
        from: query.from,
        to: query.to,
      });

    if (visibleIds) {
      dayQb.andWhere('d.employeeId IN (:...visibleIds)', { visibleIds });
    }
    if (query.employeeId) {
      dayQb.andWhere('d.employeeId = :employeeId', { employeeId: query.employeeId });
    }

    const existingDays = await dayQb.getMany();
    const dayByKey = new Map<string, TimesheetDay>();
    for (const day of existingDays) {
      dayByKey.set(`${day.employeeId}:${day.workDate}`, day);
    }

    const today = formatDateKey(new Date());
    const pendingThrough = minDateKey(query.to, today);
    const allDates = enumerateDates(query.from, query.to);

    type TeamDayRow = {
      id: string | null;
      workDate: string;
      status: string;
      totalHours: number;
      entryCount: number;
      employeeId: string;
      employeeName: string;
      employeeCode?: string;
      submittedAt: string | null;
      approvedAt: string | null;
      canAct: boolean;
      isPlaceholder: boolean;
    };

    const allRows: TeamDayRow[] = [];

    for (const employee of employees) {
      for (const workDate of allDates) {
        const key = `${employee.id}:${workDate}`;
        const day = dayByKey.get(key);
        const isFuture = workDate > today;

        if (!day) {
          if (isFuture) continue;
          if (workDate > pendingThrough) continue;
          allRows.push({
            id: null,
            workDate,
            status: 'PENDING',
            totalHours: 0,
            entryCount: 0,
            employeeId: employee.id,
            employeeName: employee.name,
            employeeCode: employee.employeeCode,
            submittedAt: null,
            approvedAt: null,
            canAct: false,
            isPlaceholder: true,
          });
          continue;
        }

        const hours = Number(day.totalHours);
        const displayStatus =
          day.status === TimesheetDayStatus.DRAFT ? 'PENDING' : day.status;

        allRows.push({
          id: day.id,
          workDate: day.workDate,
          status: displayStatus,
          totalHours: hours,
          entryCount: day.entries?.length ?? 0,
          employeeId: day.employeeId,
          employeeName: employee.name,
          employeeCode: employee.employeeCode,
          submittedAt: day.submittedAt?.toISOString() ?? null,
          approvedAt: day.approvedAt?.toISOString() ?? null,
          canAct:
            canActPermission &&
            day.status === TimesheetDayStatus.SUBMITTED &&
            (!actVisibleIds || actVisibleIds.includes(day.employeeId)),
          isPlaceholder: false,
        });
      }
    }

    allRows.sort((a, b) => {
      const dateCmp = b.workDate.localeCompare(a.workDate);
      if (dateCmp !== 0) return dateCmp;
      return a.employeeName.localeCompare(b.employeeName);
    });

    const statusSummary: Record<string, number> = {
      PENDING: 0,
      SUBMITTED: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    let totalHours = 0;
    let pendingCount = 0;
    let submittedCount = 0;

    for (const row of allRows) {
      statusSummary[row.status] = (statusSummary[row.status] ?? 0) + 1;
      totalHours += row.totalHours;
      if (row.status === 'PENDING') pendingCount += 1;
      if (row.status === 'SUBMITTED') submittedCount += 1;
    }

    const dayRows = query.status
      ? allRows.filter((row) => row.status === query.status)
      : allRows;

    const employeeList = employees.map((e) => ({
      id: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
    }));

    return {
      from: query.from,
      to: query.to,
      totalDays: dayRows.length,
      totalHours,
      pendingCount,
      submittedCount,
      statusSummary,
      employees: employeeList,
      days: dayRows,
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

  async approveTimesheetDaysBulk(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    dto: BulkApproveTimesheetDto,
  ) {
    const authContext = {
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    };
    const canAct = await this.authorizationService.hasPermission(
      authContext,
      'approvals.timesheet:act',
    );
    if (!canAct) {
      throw new ForbiddenException('You cannot approve timesheets');
    }

    let dayIds: string[] = [];

    if (dto.ids?.length) {
      dayIds = dto.ids;
    } else if (dto.from && dto.to) {
      if (dto.from > dto.to) {
        throw new BadRequestException('"from" must be on or before "to".');
      }

      const actVisibleIds = await this.getVisibleEmployeeIdsForApprover(
        dataSource,
        organizationId,
        approverEmployeeId,
        'approvals.timesheet:act',
      );

      const qb = dataSource
        .getRepository(TimesheetDay)
        .createQueryBuilder('d')
        .select('d.id', 'id')
        .where('d.organizationId = :organizationId', { organizationId })
        .andWhere('d.status = :status', { status: TimesheetDayStatus.SUBMITTED })
        .andWhere('d.workDate BETWEEN :from AND :to', {
          from: dto.from,
          to: dto.to,
        });

      if (actVisibleIds) {
        qb.andWhere('d.employeeId IN (:...actVisibleIds)', { actVisibleIds });
      }

      if (dto.employeeId) {
        if (actVisibleIds && !actVisibleIds.includes(dto.employeeId)) {
          throw new ForbiddenException('You cannot approve timesheets for this employee');
        }
        qb.andWhere('d.employeeId = :employeeId', { employeeId: dto.employeeId });
      }

      const rows = await qb.getRawMany<{ id: string }>();
      dayIds = rows.map((r) => r.id);
    } else {
      throw new BadRequestException('Provide ids or a from/to date range.');
    }

    if (dayIds.length === 0) {
      return { approvedCount: 0, skippedCount: 0, failures: [] as { id: string; message: string }[] };
    }

    const repo = dataSource.getRepository(TimesheetDay);
    let approvedCount = 0;
    let skippedCount = 0;
    const failures: { id: string; message: string }[] = [];

    for (const dayId of dayIds) {
      try {
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
        await repo.save(day);
        approvedCount += 1;
      } catch (e) {
        const message =
          e instanceof NotFoundException || e instanceof ForbiddenException
            ? e.message
            : 'Failed to approve';
        if (e instanceof NotFoundException) {
          skippedCount += 1;
        }
        failures.push({ id: dayId, message });
      }
    }

    return { approvedCount, skippedCount, failures };
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
