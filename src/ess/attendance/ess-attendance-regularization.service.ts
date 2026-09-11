import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Employee } from '../../employees/employee.entity';
import { Department } from '../../employees/entities/department.entity';
import { Designation } from '../../employees/entities/designation.entity';
import { ReportingManagersService } from '../../employees/reporting-managers.service';
import { AccessScope } from '../../rbac/constants/access-scope.enum';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { RbacConfigService } from '../../rbac/rbac-config.service';
import {
  buildOrgWallClockDate,
  formatTimeInOrg,
} from '../../common/utils/org-timezone.util';
import {
  findEmployeeLeaveOverlappingRange,
  toDateKey,
} from '../leave/leave-request-query.util';
import { LeaveRequestStatus } from '../entities/leave-request.entity';
import {
  EmployeeNotification,
  EmployeeNotificationType,
} from '../entities/employee-notification.entity';
import {
  AttendanceRegularizationRequest,
  AttendanceRegularizationStatus,
} from '../entities/attendance-regularization-request.entity';
import { AttendanceDailySummary } from '../entities/attendance-daily-summary.entity';
import { CreateAttendanceRegularizationDto } from './dto/create-attendance-regularization.dto';
import { EssRegularizationListStatus } from './dto/get-attendance-regularization-query.dto';
import { EssAttendanceService } from './ess-attendance.service';
import {
  isFutureWorkDate,
  resolveRegularizationOutDate,
} from './regularization-time.util';

const READ_PERM = 'approvals.attendance:read';
const ACT_PERM = 'approvals.attendance:act';

@Injectable()
export class EssAttendanceRegularizationService {
  constructor(
    private readonly attendanceService: EssAttendanceService,
    private readonly reportingManagersService: ReportingManagersService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly rbacConfig: RbacConfigService,
  ) {}

  async listOwn(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    status?: EssRegularizationListStatus,
  ) {
    const where: Record<string, unknown> = { organizationId, employeeId };
    if (status) where.status = status;

    const rows = await dataSource
      .getRepository(AttendanceRegularizationRequest)
      .find({
        where,
        relations: ['approver'],
        order: { appliedOn: 'DESC', createdAt: 'DESC' },
      });

    const approver = await this.resolveAssignedManager(dataSource, employeeId);
    const { timezone } = await this.attendanceService.getRegularizationContext(
      dataSource,
      organizationId,
      employeeId,
    ).catch(async () => {
      return { timezone: 'Asia/Kolkata' as string };
    });

    return {
      hasAssignedManager: Boolean(approver),
      approver: approver
        ? { id: approver.id, name: approver.name }
        : null,
      items: rows.map((row) => this.mapOwnItem(row, timezone)),
    };
  }

  async create(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    dto: CreateAttendanceRegularizationDto,
  ) {
    const workDate = dto.workDate.slice(0, 10);
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    return dataSource.transaction(async (em) => {
      const ctx = await this.attendanceService.getRegularizationContext(
        em,
        organizationId,
        employeeId,
      );

      if (isFutureWorkDate(workDate, ctx.today)) {
        throw new BadRequestException('You cannot regularize a future date');
      }

      const resolved = resolveRegularizationOutDate(
        workDate,
        dto.inTime,
        dto.outTime,
        ctx.overnight,
      );
      if ('error' in resolved) {
        if (resolved.error === 'invalid_time') {
          throw new BadRequestException('In and out times must be HH:mm');
        }
        throw new BadRequestException('Out time must be after in time');
      }

      const requestedInAt = buildOrgWallClockDate(
        workDate,
        dto.inTime,
        ctx.timezone,
      );
      const requestedOutAt = buildOrgWallClockDate(
        resolved.outDate,
        dto.outTime,
        ctx.timezone,
      );
      if (!requestedInAt || !requestedOutAt) {
        throw new BadRequestException('Invalid in or out time');
      }

      const approvedLeave = await findEmployeeLeaveOverlappingRange(
        dataSource,
        {
          organizationId,
          employeeId,
          rangeStart: workDate,
          rangeEnd: workDate,
        },
      );
      const leaveOnDay = approvedLeave.filter(
        (row) => row.status === LeaveRequestStatus.APPROVED,
      );
      if (leaveOnDay.length > 0) {
        throw new BadRequestException(
          'You cannot regularize a day covered by approved leave',
        );
      }

      const complete = await this.attendanceService.dayHasCompletePunchPair(
        em,
        organizationId,
        employeeId,
        workDate,
      );
      if (complete) {
        throw new ConflictException(
          'This day already has a complete check-in and check-out',
        );
      }

      const pending = await em
        .getRepository(AttendanceRegularizationRequest)
        .findOne({
          where: {
            organizationId,
            employeeId,
            workDate,
            status: AttendanceRegularizationStatus.PENDING,
          },
        });
      if (pending) {
        throw new ConflictException(
          'You already have a pending regularization request for this date',
        );
      }

      const manager = await this.resolveAssignedManager(dataSource, employeeId);
      if (!manager) {
        throw new BadRequestException(
          'A reporting manager must be assigned before you can submit a regularization request',
        );
      }

      const repo = em.getRepository(AttendanceRegularizationRequest);
      const saved = await repo.save(
        repo.create({
          organizationId,
          employeeId,
          workDate,
          requestedInAt,
          requestedOutAt,
          reason,
          status: AttendanceRegularizationStatus.PENDING,
          approverEmployeeId: manager.id,
          appliedOn: ctx.today,
        }),
      );

      const applicant = await em.getRepository(Employee).findOne({
        where: { id: employeeId },
      });
      if (applicant) {
        await this.notifyApprover(em, {
          organizationId,
          request: saved,
          applicant,
          approver: manager,
        });
      }

      return this.mapOwnItem(saved, ctx.timezone, manager.name);
    });
  }

  async withdraw(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    requestId: string,
  ) {
    const repo = dataSource.getRepository(AttendanceRegularizationRequest);
    const row = await repo.findOne({
      where: { id: requestId, organizationId, employeeId },
    });
    if (!row) {
      throw new NotFoundException('Regularization request not found');
    }
    if (row.status !== AttendanceRegularizationStatus.PENDING) {
      throw new BadRequestException(
        'Only pending regularization requests can be withdrawn',
      );
    }
    row.status = AttendanceRegularizationStatus.WITHDRAWN;
    await repo.save(row);
    return { success: true, status: row.status };
  }

  async listPendingApprovals(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ) {
    const rows = await this.findPendingApprovalRows(
      dataSource,
      organizationId,
      approverEmployeeId,
    );
    const ctxTimezone = await this.safeTimezone(
      dataSource,
      organizationId,
      approverEmployeeId,
    );
    return Promise.all(
      rows.map((row) => this.mapApprovalListItem(dataSource, row, ctxTimezone)),
    );
  }

  async getApprovalDetail(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
  ) {
    const row = await this.findRequestForApproverRead(
      dataSource,
      organizationId,
      approverEmployeeId,
      requestId,
    );
    if (!row) {
      throw new NotFoundException('Pending regularization request not found');
    }
    return this.mapApprovalDetail(dataSource, row);
  }

  async approve(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
    notes?: string,
  ) {
    return dataSource.transaction(async (em) => {
      const row = await this.findPendingForApproverAct(
        em,
        organizationId,
        approverEmployeeId,
        requestId,
        dataSource,
      );
      if (!row) {
        throw new NotFoundException('Pending regularization request not found');
      }

      const workDate = toDateKey(row.workDate);
      await this.attendanceService.applyRegularizationPunches(
        em,
        organizationId,
        row.employeeId,
        workDate,
        row.requestedInAt,
        row.requestedOutAt,
      );

      row.status = AttendanceRegularizationStatus.APPROVED;
      if (notes?.trim()) {
        row.approvalNotes = notes.trim();
      }
      await em.getRepository(AttendanceRegularizationRequest).save(row);

      const applicant =
        row.employee ??
        (await em.getRepository(Employee).findOne({ where: { id: row.employeeId } }));
      if (applicant) {
        await this.notifyApplicant(em, {
          organizationId,
          request: row,
          applicant,
          decision: 'APPROVED',
          notes: notes?.trim(),
        });
      }

      return { success: true, status: row.status };
    });
  }

  async reject(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
    reason?: string,
  ) {
    return dataSource.transaction(async (em) => {
      const row = await this.findPendingForApproverAct(
        em,
        organizationId,
        approverEmployeeId,
        requestId,
        dataSource,
      );
      if (!row) {
        throw new NotFoundException('Pending regularization request not found');
      }

      row.status = AttendanceRegularizationStatus.REJECTED;
      if (reason?.trim()) {
        row.rejectionReason = reason.trim();
      }
      await em.getRepository(AttendanceRegularizationRequest).save(row);

      const applicant =
        row.employee ??
        (await em.getRepository(Employee).findOne({ where: { id: row.employeeId } }));
      if (applicant) {
        await this.notifyApplicant(em, {
          organizationId,
          request: row,
          applicant,
          decision: 'REJECTED',
          notes: reason?.trim(),
        });
      }

      return { success: true, status: row.status };
    });
  }

  private async resolveAssignedManager(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<Employee | null> {
    const managerId =
      await this.reportingManagersService.getActiveReportingManagerId(
        dataSource,
        employeeId,
      );
    if (!managerId) return null;
    return dataSource.getRepository(Employee).findOne({ where: { id: managerId } });
  }

  private mapOwnItem(
    row: AttendanceRegularizationRequest,
    timezone: string,
    approverName?: string,
  ) {
    return {
      id: row.id,
      workDate: toDateKey(row.workDate),
      inTime: formatTimeInOrg(row.requestedInAt, timezone),
      outTime: formatTimeInOrg(row.requestedOutAt, timezone),
      requestedInAt: row.requestedInAt.toISOString(),
      requestedOutAt: row.requestedOutAt.toISOString(),
      reason: row.reason,
      status: row.status,
      approverName: approverName ?? row.approver?.name ?? undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      approvalNotes: row.approvalNotes ?? undefined,
      appliedOn: toDateKey(row.appliedOn),
    };
  }

  private async mapApprovalListItem(
    dataSource: DataSource,
    row: AttendanceRegularizationRequest,
    timezone: string,
  ) {
    const labels = await this.resolveEmployeeOrgLabels(dataSource, row.employee);
    return {
      id: row.id,
      employeeName: row.employee?.name ?? 'Employee',
      employeeCode: row.employee?.employeeCode,
      departmentName: labels.departmentName,
      workDate: toDateKey(row.workDate),
      inTime: formatTimeInOrg(row.requestedInAt, timezone),
      outTime: formatTimeInOrg(row.requestedOutAt, timezone),
      appliedOn: toDateKey(row.appliedOn),
    };
  }

  private async mapApprovalDetail(
    dataSource: DataSource,
    row: AttendanceRegularizationRequest,
  ) {
    const labels = await this.resolveEmployeeOrgLabels(dataSource, row.employee);
    let timezone = 'Asia/Kolkata';
    try {
      const ctx = await this.attendanceService.getRegularizationContext(
        dataSource,
        row.organizationId,
        row.employeeId,
      );
      timezone = ctx.timezone;
    } catch {
      /* keep default */
    }

    const summary = await dataSource.getRepository(AttendanceDailySummary).findOne({
      where: {
        organizationId: row.organizationId,
        employeeId: row.employeeId,
        workDate: toDateKey(row.workDate),
      },
    });

    return {
      id: row.id,
      status: row.status,
      workDate: toDateKey(row.workDate),
      inTime: formatTimeInOrg(row.requestedInAt, timezone),
      outTime: formatTimeInOrg(row.requestedOutAt, timezone),
      requestedInAt: row.requestedInAt.toISOString(),
      requestedOutAt: row.requestedOutAt.toISOString(),
      reason: row.reason,
      appliedOn: toDateKey(row.appliedOn),
      employee: {
        name: row.employee?.name ?? 'Employee',
        employeeCode: row.employee?.employeeCode,
        departmentName: labels.departmentName,
        designationName: labels.designationName,
      },
      currentAttendance: summary
        ? {
            status: summary.status,
            firstIn: formatTimeInOrg(summary.firstIn, timezone),
            lastOut: formatTimeInOrg(summary.lastOut, timezone),
          }
        : null,
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

    return {
      departmentName: departmentName ?? undefined,
      designationName: designationName ?? undefined,
    };
  }

  private async findPendingApprovalRows(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ): Promise<AttendanceRegularizationRequest[]> {
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const relations = [
      'employee',
      'employee.departmentRef',
      'employee.designationRef',
      'approver',
    ];

    let rows = await dataSource
      .getRepository(AttendanceRegularizationRequest)
      .find({
        where: {
          organizationId,
          approverEmployeeId,
          status: AttendanceRegularizationStatus.PENDING,
        },
        relations,
        order: { appliedOn: 'DESC' },
      });

    if (this.rbacConfig.isScopeV2Enabled()) {
      const scope = auth.permissionScopes.get(READ_PERM) ?? AccessScope.SELF;
      if (scope === AccessScope.ORGANIZATION || scope === AccessScope.GLOBAL) {
        rows = await dataSource
          .getRepository(AttendanceRegularizationRequest)
          .find({
            where: {
              organizationId,
              status: AttendanceRegularizationStatus.PENDING,
            },
            relations,
            order: { appliedOn: 'DESC' },
          });
      } else {
        const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
          dataSource,
          approverEmployeeId,
          READ_PERM,
          auth,
        );
        if (visibleIds) {
          const scoped = await dataSource
            .getRepository(AttendanceRegularizationRequest)
            .find({
              where: {
                organizationId,
                status: AttendanceRegularizationStatus.PENDING,
                employeeId: In(visibleIds),
              },
              relations,
              order: { appliedOn: 'DESC' },
            });
          const seen = new Set(rows.map((r) => r.id));
          for (const row of scoped) {
            if (!seen.has(row.id)) rows.push(row);
          }
        }
      }
    }

    return rows;
  }

  private async findRequestForApproverRead(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
  ): Promise<AttendanceRegularizationRequest | null> {
    const row = await dataSource
      .getRepository(AttendanceRegularizationRequest)
      .findOne({
        where: { id: requestId, organizationId },
        relations: [
          'employee',
          'employee.departmentRef',
          'employee.designationRef',
          'approver',
        ],
      });
    if (!row || row.status !== AttendanceRegularizationStatus.PENDING) {
      return null;
    }
    if (row.approverEmployeeId === approverEmployeeId) {
      return row;
    }
    if (!this.rbacConfig.isScopeV2Enabled()) {
      return null;
    }
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      READ_PERM,
      auth,
    );
    if (visibleIds && visibleIds.includes(row.employeeId)) {
      return row;
    }
    return null;
  }

  private async findPendingForApproverAct(
    em: EntityManager,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
    dataSource: DataSource,
  ): Promise<AttendanceRegularizationRequest | null> {
    const repo = em.getRepository(AttendanceRegularizationRequest);
    const direct = await repo.findOne({
      where: {
        id: requestId,
        organizationId,
        approverEmployeeId,
        status: AttendanceRegularizationStatus.PENDING,
      },
      relations: ['employee'],
    });
    if (direct) return direct;

    if (!this.rbacConfig.isScopeV2Enabled()) {
      return null;
    }

    const row = await repo.findOne({
      where: {
        id: requestId,
        organizationId,
        status: AttendanceRegularizationStatus.PENDING,
      },
      relations: ['employee'],
    });
    if (!row) return null;

    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      ACT_PERM,
      auth,
    );
    if (visibleIds && visibleIds.includes(row.employeeId)) {
      return row;
    }
    return null;
  }

  private async notifyApprover(
    em: EntityManager,
    params: {
      organizationId: string;
      request: AttendanceRegularizationRequest;
      applicant: Employee;
      approver: Employee;
    },
  ) {
    const { organizationId, request, applicant, approver } = params;
    if (approver.id === applicant.id) return;
    const dateLabel = toDateKey(request.workDate);
    await em.getRepository(EmployeeNotification).insert({
      organizationId,
      recipientEmployeeId: approver.id,
      attendanceRegularizationRequestId: request.id,
      type: EmployeeNotificationType.REGULARIZATION_PENDING_APPROVAL,
      title: 'Attendance regularization approval required',
      body: `${applicant.name} requested attendance regularization for ${dateLabel}`,
    });
  }

  private async notifyApplicant(
    em: EntityManager,
    params: {
      organizationId: string;
      request: AttendanceRegularizationRequest;
      applicant: Employee;
      decision: 'APPROVED' | 'REJECTED';
      notes?: string;
    },
  ) {
    const { organizationId, request, applicant, decision, notes } = params;
    const dateLabel = toDateKey(request.workDate);
    const isApproved = decision === 'APPROVED';
    const title = isApproved
      ? 'Attendance regularization approved'
      : 'Attendance regularization rejected';
    const body = isApproved
      ? `Your regularization request for ${dateLabel} was approved.${
          notes ? ` Note: ${notes}` : ''
        }`
      : `Your regularization request for ${dateLabel} was rejected.${
          notes ? ` Reason: ${notes}` : ''
        }`;

    await em.getRepository(EmployeeNotification).insert({
      organizationId,
      recipientEmployeeId: applicant.id,
      attendanceRegularizationRequestId: request.id,
      type: isApproved
        ? EmployeeNotificationType.REGULARIZATION_APPROVED
        : EmployeeNotificationType.REGULARIZATION_REJECTED,
      title,
      body,
    });
  }

  private async safeTimezone(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ): Promise<string> {
    try {
      const ctx = await this.attendanceService.getRegularizationContext(
        dataSource,
        organizationId,
        employeeId,
      );
      return ctx.timezone;
    } catch {
      return 'Asia/Kolkata';
    }
  }
}
