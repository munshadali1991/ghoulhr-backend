import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { FieldEncryptionService } from '../../common/services/field-encryption.service';
import { Employee, EmployeeStatus } from '../../employees/employee.entity';
import { EmployeeDocument } from '../../employees/entities/employee-document.entity';
import { EmployeeEmploymentDetail } from '../../employees/entities/employee-employment-detail.entity';
import { EmployeeLeaveBalance } from '../entities/employee-leave-balance.entity';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../entities/leave-request.entity';
import { LeaveRequestCcRecipient } from '../entities/leave-request-cc-recipient.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { EssLeaveRequestListStatus } from './dto/get-leave-requests-query.dto';
import { PreviewLeaveDaysQueryDto } from './dto/preview-leave-days-query.dto';
import { SearchColleaguesQueryDto } from './dto/search-colleagues-query.dto';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveDayCalculatorService } from './leave-day-calculator.service';
import { LeavePolicyService } from './leave-policy.service';
import { LeaveValidationService } from './leave-validation.service';
import { ReportingManagersService } from '../../employees/reporting-managers.service';
import { LeaveNotificationService } from './leave-notification.service';
import { resolveOrgTimezone } from '../../common/utils/org-timezone.util';
import { OrganizationCalendarQueryService } from '../../settings/organization-calendar-query.service';
import { SettingsService } from '../../settings/settings.service';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { RbacConfigService } from '../../rbac/rbac-config.service';
import { AccessScope } from '../../rbac/constants/access-scope.enum';

@Injectable()
export class EssLeaveService {
  constructor(
    private readonly policyService: LeavePolicyService,
    private readonly balanceService: LeaveBalanceService,
    private readonly dayCalculator: LeaveDayCalculatorService,
    private readonly validationService: LeaveValidationService,
    private readonly fieldEncryption: FieldEncryptionService,
    private readonly reportingManagersService: ReportingManagersService,
    private readonly leaveNotificationService: LeaveNotificationService,
    private readonly calendarQuery: OrganizationCalendarQueryService,
    private readonly settingsService: SettingsService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly rbacConfig: RbacConfigService,
  ) {}

  private async resolveOrgTimezone(
    dataSource: DataSource,
  ): Promise<string> {
    const profile = await this.settingsService.getOrgProfile(dataSource);
    return resolveOrgTimezone(profile.timezone);
  }

  async getBalances(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    year?: number,
  ) {
    const resolvedYear = year ?? new Date().getFullYear();
    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const policies = await this.policyService.getApplicablePolicies(
      dataSource,
      organizationId,
      locationId,
    );

    const balances = await this.balanceService.ensureBalancesForYear(
      dataSource,
      organizationId,
      employeeId,
      resolvedYear,
      policies,
    );

    const balanceByConfigId = new Map(
      balances.map((b) => [b.leaveConfigurationId, b]),
    );

    return {
      year: resolvedYear,
      balances: policies.map((policy) => {
        const row = balanceByConfigId.get(policy.id)!;
        return this.balanceService.mapBalanceToApi(policy, row);
      }),
      rules: policies.map((p) => this.policyService.mapPolicyToRules(p)),
    };
  }

  async getBalanceDetail(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    leaveConfigurationId: string,
    year?: number,
  ) {
    const resolvedYear = year ?? new Date().getFullYear();
    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const policies = await this.policyService.getApplicablePolicies(
      dataSource,
      organizationId,
      locationId,
    );

    const policy = policies.find((p) => p.id === leaveConfigurationId);
    if (!policy) {
      throw new NotFoundException('Leave type not found');
    }

    const balances = await this.balanceService.ensureBalancesForYear(
      dataSource,
      organizationId,
      employeeId,
      resolvedYear,
      policies,
    );

    const row = balances.find(
      (b) => b.leaveConfigurationId === leaveConfigurationId,
    );
    if (!row) {
      throw new NotFoundException('Leave balance not found');
    }

    const granted = Number(row.grantedDays);
    const availed = Number(row.usedDays);
    const applied = Number(row.pendingDays);
    const availableBalance = this.balanceService.computeAvailableBalance(
      granted,
      availed,
      applied,
    );

    const openingBalance = await this.balanceService.computeOpeningBalance(
      dataSource,
      organizationId,
      employeeId,
      policy,
      resolvedYear,
    );

    const yearStart = `${resolvedYear}-01-01`;
    const yearEnd = `${resolvedYear}-12-31`;

    const allRequests = await dataSource.getRepository(LeaveRequest).find({
      where: {
        organizationId,
        employeeId,
        leaveConfigurationId,
      },
      order: { appliedOn: 'DESC', createdAt: 'DESC' },
    });

    const requestsInYear = allRequests.filter((req) => {
      const start =
        typeof req.startDate === 'string'
          ? req.startDate.slice(0, 10)
          : (req.startDate as Date).toISOString().slice(0, 10);
      const end =
        typeof req.endDate === 'string'
          ? req.endDate.slice(0, 10)
          : (req.endDate as Date).toISOString().slice(0, 10);
      return start <= yearEnd && end >= yearStart;
    });

    const monthlyConsumed = this.balanceService.buildMonthlyConsumed(
      requestsInYear,
      resolvedYear,
    );
    const monthlyChart = this.balanceService.buildMonthlyChart(
      policy,
      openingBalance,
      monthlyConsumed,
      resolvedYear,
    );

    const transactions = requestsInYear.map((req) =>
      this.balanceService.mapRequestToLedgerTransaction(req),
    );

    return {
      year: resolvedYear,
      leaveType: { id: policy.id, name: policy.name },
      summary: {
        availableBalance,
        openingBalance,
        granted,
        availed,
        applied,
      },
      monthlyChart,
      transactions,
    };
  }

  async getLeaveTypes(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const { locationId, employment } =
      await this.policyService.getEmployeeContext(
        dataSource,
        organizationId,
        employeeId,
      );

    const policies = await this.policyService.getApplicablePolicies(
      dataSource,
      organizationId,
      locationId,
    );

    const types = policies.map((p) => ({
      value: p.id,
      label: p.name,
    }));

    const approvers = await this.resolveApprovers(
      dataSource,
      employeeId,
      employment,
    );

    return {
      types,
      approvers,
      rules: policies.map((p) => this.policyService.mapPolicyToRules(p)),
    };
  }

  async searchColleagues(
    dataSource: DataSource,
    employeeId: string,
    query: SearchColleaguesQueryDto,
  ) {
    const limit = query.limit ?? 25;
    const eligibleStatuses = [
      EmployeeStatus.ACTIVE,
      EmployeeStatus.PENDING_ACTIVATION,
    ];

    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .select([
        'employee.id',
        'employee.name',
        'employee.employeeCode',
        'employee.email',
      ])
      .where('employee.status IN (:...statuses)', { statuses: eligibleStatuses })
      .andWhere('employee.id != :employeeId', { employeeId })
      .andWhere('employee.deletedAt IS NULL')
      .orderBy('employee.name', 'ASC')
      .take(limit);

    const term = query.search?.trim();
    if (term) {
      qb.andWhere(
        '(employee.name ILIKE :term OR employee.employeeCode ILIKE :term OR employee.email ILIKE :term)',
        { term: `%${term}%` },
      );
    }

    const rows = await qb.getMany();

    return {
      employees: rows.map((employee) => ({
        id: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode,
        label: `${employee.name} (${employee.employeeCode})`,
      })),
    };
  }

  async previewLeaveDays(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    query: PreviewLeaveDaysQueryDto,
  ) {
    const { policy } = await this.policyService.getPolicyForEmployee(
      dataSource,
      organizationId,
      employeeId,
      query.leaveConfigurationId,
    );

    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );
    const holidays = await this.calendarQuery.findPublishedHolidaysInRange(
      dataSource,
      {
        organizationId,
        fromDate: query.fromDate,
        toDate: query.toDate,
        locationId,
      },
    );

    const timezone = await this.resolveOrgTimezone(dataSource);
    const daysCount = this.dayCalculator.calculate({
      fromDate: query.fromDate,
      toDate: query.toDate,
      fromSession: query.fromSession,
      toSession: query.toSession,
      policy,
      holidayDates: this.calendarQuery.holidayDateSet(holidays),
      timezone,
    });

    const year = new Date(query.fromDate).getFullYear();
    const balance = await dataSource.transaction((em) =>
      this.balanceService.getOrCreateBalance(
        em,
        organizationId,
        employeeId,
        policy.id,
        year,
        policy,
      ),
    );

    const granted = Number(balance.grantedDays);
    const consumed = Number(balance.usedDays);
    const pending = Number(balance.pendingDays);
    const available = granted - consumed - pending;
    const balanceAfterPreview =
      Math.round((available - daysCount) * 100) / 100;

    return {
      daysCount,
      currentBalance: Math.round(available * 100) / 100,
      balanceAfterPreview,
    };
  }

  async listRequests(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    status: EssLeaveRequestListStatus,
  ) {
    const rows = await dataSource.getRepository(LeaveRequest).find({
      where: {
        organizationId,
        employeeId,
        status,
      },
      relations: ['leaveConfiguration', 'approver'],
      order: { appliedOn: 'DESC', createdAt: 'DESC' },
    });

    return rows.map((row) =>
      this.mapRequestToApi(
        row,
        row.leaveConfiguration?.name ?? 'Leave',
        row.approver?.name,
        row.leaveConfiguration?.leaveCategory,
      ),
    );
  }

  async withdrawRequest(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    requestId: string,
  ) {
    return dataSource.transaction(async (em) => {
      const requestRepo = em.getRepository(LeaveRequest);
      const row = await requestRepo.findOne({
        where: { id: requestId, organizationId, employeeId },
        relations: ['leaveConfiguration'],
      });

      if (!row) {
        throw new NotFoundException('Leave request not found');
      }

      if (row.status !== LeaveRequestStatus.PENDING) {
        throw new BadRequestException(
          'Only pending leave requests can be withdrawn',
        );
      }

      const year = new Date(
        typeof row.startDate === 'string'
          ? row.startDate
          : (row.startDate as Date).toISOString().slice(0, 10),
      ).getFullYear();

      const balanceRepo = em.getRepository(EmployeeLeaveBalance);
      const balance = await balanceRepo.findOne({
        where: {
          organizationId,
          employeeId,
          leaveConfigurationId: row.leaveConfigurationId,
          year,
        },
      });

      if (balance) {
        this.balanceService.decrementPending(balance, Number(row.daysCount));
        await balanceRepo.save(balance);
      }

      row.status = LeaveRequestStatus.WITHDRAWN;
      await requestRepo.save(row);

      return { success: true };
    });
  }

  async createRequest(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ) {
    const { policy, employee } = await this.policyService.getPolicyForEmployee(
      dataSource,
      organizationId,
      employeeId,
      dto.leaveConfigurationId,
    );

    const { locationId } = await this.policyService.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );
    const holidays = await this.calendarQuery.findPublishedHolidaysInRange(
      dataSource,
      {
        organizationId,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        locationId,
      },
    );

    const timezone = await this.resolveOrgTimezone(dataSource);
    const daysCount = this.dayCalculator.calculate({
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      fromSession: dto.fromSession,
      toSession: dto.toSession,
      policy,
      holidayDates: this.calendarQuery.holidayDateSet(holidays),
      timezone,
    });

    if (daysCount <= 0) {
      throw new BadRequestException(
        'Leave duration must be at least half a day',
      );
    }

    const year = new Date(dto.fromDate).getFullYear();

    return dataSource.transaction(async (em) => {
      const balance = await this.balanceService.getOrCreateBalance(
        em,
        organizationId,
        employeeId,
        policy.id,
        year,
        policy,
      );

      const approver = await this.validationService.assertApproverExists(
        em,
        organizationId,
        dto.applyingTo,
      );

      const supportingDocumentId = await this.resolveSupportingDocument(
        em,
        organizationId,
        employee,
        employeeId,
        dto,
      );

      const hasDocument = Boolean(
        supportingDocumentId ?? dto.supportingDocumentId,
      );

      this.validationService.assertCanSubmit(
        policy,
        balance,
        daysCount,
        dto,
        hasDocument,
      );

      const requestRepo = em.getRepository(LeaveRequest);
      const appliedOn = new Date().toISOString().slice(0, 10);

      const notifyAllEmployees = dto.notifyAllEmployees ?? false;
      const ccEmployeeIds = await this.resolveCcRecipients(
        em,
        employeeId,
        dto.ccEmployeeIds ?? [],
      );

      const saved = await requestRepo.save(
        requestRepo.create({
          organizationId,
          employeeId,
          leaveConfigurationId: policy.id,
          status: LeaveRequestStatus.PENDING,
          startDate: dto.fromDate,
          endDate: dto.toDate,
          startSession: dto.fromSession,
          endSession: dto.toSession,
          daysCount: String(daysCount),
          reason: dto.reason,
          contactDetails: dto.contactDetails?.trim() || null,
          approverEmployeeId: approver.id,
          supportingDocumentId: supportingDocumentId ?? dto.supportingDocumentId ?? null,
          appliedOn,
          notifyAllEmployees,
        }),
      );

      await this.saveCcRecipients(em, saved.id, ccEmployeeIds);

      this.balanceService.incrementPending(balance, daysCount);
      await em.getRepository(EmployeeLeaveBalance).save(balance);

      await this.leaveNotificationService.broadcastLeaveApplied(em, {
        organizationId,
        leaveRequest: saved,
        applicant: employee,
        leaveTypeName: policy.name,
        ccEmployeeIds,
      });

      return {
        message: 'Leave request submitted successfully',
        request: this.mapRequestToApi(
          saved,
          policy.name,
          approver.name,
          policy.leaveCategory,
        ),
      };
    });
  }

  private async resolveSupportingDocument(
    em: EntityManager,
    organizationId: string,
    employee: Employee,
    employeeId: string,
    dto: CreateLeaveRequestDto,
  ): Promise<string | null> {
    if (dto.supportingDocumentId) {
      const existing = await em.getRepository(EmployeeDocument).findOne({
        where: {
          id: dto.supportingDocumentId,
          employee: { id: employeeId },
        },
      });
      if (!existing) {
        throw new BadRequestException('Supporting document not found');
      }
      return existing.id;
    }

    const doc = dto.supportingDocument;
    if (!doc?.dataBase64?.trim()) {
      return null;
    }

    const approxBytes = Math.floor((doc.dataBase64.length * 3) / 4);
    if (approxBytes > 5 * 1024 * 1024) {
      throw new BadRequestException('Supporting document exceeds size limit');
    }

    const saved = await em.getRepository(EmployeeDocument).save(
      em.getRepository(EmployeeDocument).create({
        employee,
        documentType: doc.documentType,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: approxBytes,
        storageDriver: 'inline_base64',
        payloadEnc: this.fieldEncryption.encrypt(doc.dataBase64),
        uploadedBy: employeeId,
        verificationStatus: 'PENDING',
      }),
    );

    return saved.id;
  }

  private async resolveCcRecipients(
    em: EntityManager,
    applicantId: string,
    ids: string[],
  ): Promise<string[]> {
    const unique = [...new Set(ids.filter((id) => id && id !== applicantId))];
    if (unique.length === 0) {
      return [];
    }

    const found = await em.getRepository(Employee).find({
      where: {
        id: In(unique),
        status: In([
          EmployeeStatus.ACTIVE,
          EmployeeStatus.PENDING_ACTIVATION,
        ]),
      },
      select: ['id'],
    });

    if (found.length !== unique.length) {
      throw new BadRequestException(
        'One or more Cc recipients are invalid or inactive',
      );
    }

    return found.map((employee) => employee.id);
  }

  private async saveCcRecipients(
    em: EntityManager,
    leaveRequestId: string,
    employeeIds: string[],
  ): Promise<void> {
    if (employeeIds.length === 0) {
      return;
    }

    const repo = em.getRepository(LeaveRequestCcRecipient);
    await repo.insert(
      employeeIds.map((employeeId) => ({
        leaveRequestId,
        employeeId,
      })),
    );
  }

  private async resolveApprovers(
    dataSource: DataSource,
    employeeId: string,
    employment: EmployeeEmploymentDetail | null,
  ): Promise<{ value: string; label: string }[]> {
    const empRepo = dataSource.getRepository(Employee);
    const reportingManagerId =
      await this.reportingManagersService.getActiveReportingManagerId(
        dataSource,
        employeeId,
      );
    const ids = [reportingManagerId, employment?.hrManagerId].filter(
      (id): id is string => Boolean(id),
    );

    if (ids.length === 0) {
      const employees = await empRepo.find({
        take: 20,
        order: { name: 'ASC' },
      });
      return employees
        .filter((e) => e.id && e.name)
        .map((e) => ({ value: e.id, label: e.name }));
    }

    const unique = [...new Set(ids)];
    const found = await empRepo.find({
      where: unique.map((id) => ({ id })),
    });

    return found.map((e) => ({ value: e.id, label: e.name }));
  }

  private mapRequestToApi(
    row: LeaveRequest,
    leaveTypeName: string,
    approverName?: string,
    leaveCategory?: string | null,
  ) {
    return {
      id: row.id,
      category: leaveCategory?.trim() || 'Leave',
      leaveType: leaveTypeName,
      status: row.status,
      daysCount: Number(row.daysCount),
      approverName: approverName ?? undefined,
      duration: {
        startDate:
          typeof row.startDate === 'string'
            ? row.startDate
            : (row.startDate as Date).toISOString().slice(0, 10),
        endDate:
          typeof row.endDate === 'string'
            ? row.endDate
            : (row.endDate as Date).toISOString().slice(0, 10),
        startSession: row.startSession,
        endSession: row.endSession,
      },
      reason: row.reason ?? undefined,
      appliedOn:
        typeof row.appliedOn === 'string'
          ? row.appliedOn
          : (row.appliedOn as Date).toISOString().slice(0, 10),
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

    let rows = await dataSource.getRepository(LeaveRequest).find({
      where: {
        organizationId,
        approverEmployeeId,
        status: LeaveRequestStatus.PENDING,
      },
      relations: ['employee', 'leaveConfiguration', 'approver'],
      order: { appliedOn: 'DESC' },
    });

    if (this.rbacConfig.isScopeV2Enabled()) {
      const scope = auth.permissionScopes.get('approvals.leave:read') ?? AccessScope.SELF;
      if (scope === AccessScope.ORGANIZATION || scope === AccessScope.GLOBAL) {
        rows = await dataSource.getRepository(LeaveRequest).find({
          where: { organizationId, status: LeaveRequestStatus.PENDING },
          relations: ['employee', 'leaveConfiguration', 'approver'],
          order: { appliedOn: 'DESC' },
        });
      } else {
        const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
          dataSource,
          approverEmployeeId,
          'approvals.leave:read',
          auth,
        );
        if (visibleIds) {
          const scoped = await dataSource.getRepository(LeaveRequest).find({
            where: {
              organizationId,
              status: LeaveRequestStatus.PENDING,
              employeeId: In(visibleIds),
            },
            relations: ['employee', 'leaveConfiguration', 'approver'],
            order: { appliedOn: 'DESC' },
          });
          const seen = new Set(rows.map((r) => r.id));
          for (const row of scoped) {
            if (!seen.has(row.id)) rows.push(row);
          }
        }
      }
    }

    return rows.map((row) =>
      this.mapRequestToApi(
        row,
        row.leaveConfiguration?.name ?? 'Leave',
        row.approver?.name,
        row.leaveConfiguration?.leaveCategory,
      ),
    );
  }

  private async findPendingLeaveForApprover(
    em: EntityManager,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
    dataSource: DataSource,
  ): Promise<LeaveRequest | null> {
    const requestRepo = em.getRepository(LeaveRequest);
    const direct = await requestRepo.findOne({
      where: {
        id: requestId,
        organizationId,
        approverEmployeeId,
        status: LeaveRequestStatus.PENDING,
      },
    });
    if (direct) return direct;

    if (!this.rbacConfig.isScopeV2Enabled()) {
      return null;
    }

    const row = await requestRepo.findOne({
      where: { id: requestId, organizationId, status: LeaveRequestStatus.PENDING },
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
      'approvals.leave:act',
      auth,
    );
    if (visibleIds && visibleIds.includes(row.employeeId)) {
      return row;
    }
    return null;
  }

  async approveLeaveRequest(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
  ) {
    return dataSource.transaction(async (em) => {
      const requestRepo = em.getRepository(LeaveRequest);
      const row = await this.findPendingLeaveForApprover(
        em,
        organizationId,
        approverEmployeeId,
        requestId,
        dataSource,
      );

      if (!row) {
        throw new NotFoundException('Pending leave request not found');
      }

      const year = new Date(
        typeof row.startDate === 'string'
          ? row.startDate
          : (row.startDate as Date).toISOString().slice(0, 10),
      ).getFullYear();

      const balanceRepo = em.getRepository(EmployeeLeaveBalance);
      const balance = await balanceRepo.findOne({
        where: {
          organizationId,
          employeeId: row.employeeId,
          leaveConfigurationId: row.leaveConfigurationId,
          year,
        },
      });

      const days = Number(row.daysCount);
      if (balance) {
        this.balanceService.decrementPending(balance, days);
        balance.usedDays = String(
          this.balanceService.roundDays(Number(balance.usedDays) + days),
        );
        await balanceRepo.save(balance);
      }

      row.status = LeaveRequestStatus.APPROVED;
      await requestRepo.save(row);
      return { success: true, status: row.status };
    });
  }

  async rejectLeaveRequest(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    requestId: string,
    reason?: string,
  ) {
    return dataSource.transaction(async (em) => {
      const requestRepo = em.getRepository(LeaveRequest);
      const row = await this.findPendingLeaveForApprover(
        em,
        organizationId,
        approverEmployeeId,
        requestId,
        dataSource,
      );

      if (!row) {
        throw new NotFoundException('Pending leave request not found');
      }

      const year = new Date(
        typeof row.startDate === 'string'
          ? row.startDate
          : (row.startDate as Date).toISOString().slice(0, 10),
      ).getFullYear();

      const balanceRepo = em.getRepository(EmployeeLeaveBalance);
      const balance = await balanceRepo.findOne({
        where: {
          organizationId,
          employeeId: row.employeeId,
          leaveConfigurationId: row.leaveConfigurationId,
          year,
        },
      });

      if (balance) {
        this.balanceService.decrementPending(balance, Number(row.daysCount));
        await balanceRepo.save(balance);
      }

      row.status = LeaveRequestStatus.REJECTED;
      if (reason?.trim()) {
        row.reason = `${row.reason ?? ''}\n[Rejection] ${reason.trim()}`.trim();
      }
      await requestRepo.save(row);
      return { success: true, status: row.status };
    });
  }
}
