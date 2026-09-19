import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  Employee,
  EmployeeRole,
  EmployeeStatus,
} from '../../employees/employee.entity';
import { Department } from '../../employees/entities/department.entity';
import { Designation } from '../../employees/entities/designation.entity';
import { ReportingManagersService } from '../../employees/reporting-managers.service';
import { AccessScope } from '../../rbac/constants/access-scope.enum';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import { RbacConfigService } from '../../rbac/rbac-config.service';
import { StorageService } from '../../storage/storage.service';
import { STORAGE_DRIVERS } from '../../storage/storage.constants';
import { OrganizationSetting } from '../../settings/entities/organization-setting.entity';
import {
  SETTING_KEYS,
  SUPPORTED_CURRENCIES,
} from '../../settings/settings.constants';
import {
  orgDateKeyForInstant,
  resolveOrgTimezone,
} from '../../common/utils/org-timezone.util';
import {
  EmployeeNotification,
  EmployeeNotificationType,
} from '../entities/employee-notification.entity';
import { ExpenseCategory } from '../entities/expense-category.entity';
import { ExpenseReceipt } from '../entities/expense-receipt.entity';
import {
  ExpenseClaim,
  ExpenseClaimStatus,
  ExpensePaymentMode,
} from '../entities/expense-claim.entity';
import { ExpenseClaimLine } from '../entities/expense-claim-line.entity';
import {
  ExpenseClaimAuditAction,
  ExpenseClaimAuditLog,
} from '../entities/expense-claim-audit-log.entity';
import {
  CreateExpenseClaimDto,
  CreateExpenseClaimLineDto,
  ExpenseReceiptDto,
  MarkExpensePaidDto,
  UpdateExpenseClaimDto,
  UpdateExpenseClaimLineDto,
} from './dto/expense-claim.dto';
import {
  csvEscape as escapeCsvCell,
  normalizeMoneyAmount,
} from './expense-money.util';

const MANAGER_READ = 'approvals.expense:read';
const MANAGER_ACT = 'approvals.expense:act';

const DEFAULT_CLAIM_WINDOW_DAYS = 90;
const DEFAULT_MAX_LINES = 50;
const DEFAULT_MAX_CLAIM_AMOUNT = 500000;

const EDITABLE_STATUSES = new Set([
  ExpenseClaimStatus.DRAFT,
  ExpenseClaimStatus.SENT_BACK,
]);

const NON_TERMINAL_STATUSES = [
  ExpenseClaimStatus.DRAFT,
  ExpenseClaimStatus.PENDING_MANAGER,
  ExpenseClaimStatus.PENDING_FINANCE,
  ExpenseClaimStatus.SENT_BACK,
  ExpenseClaimStatus.APPROVED,
];

export interface ExpensePolicy {
  defaultClaimWindowDays: number;
  maxLinesPerClaim: number;
  maxClaimAmount: number;
  defaultCurrency: string;
  timezone: string;
}

@Injectable()
export class EssExpenseService {
  constructor(
    private readonly reportingManagersService: ReportingManagersService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly rbacConfig: RbacConfigService,
    private readonly storageService: StorageService,
  ) {}

  // ─── Categories / policy ─────────────────────────────────────────────

  async listActiveCategories(dataSource: DataSource, organizationId: string) {
    const rows = await dataSource.getRepository(ExpenseCategory).find({
      where: { organizationId, isActive: true },
      order: { name: 'ASC' },
    });
    return rows.map((c) => this.mapCategory(c));
  }

  async listAllCategories(dataSource: DataSource, organizationId: string) {
    await this.ensureDefaultCategories(dataSource, organizationId);
    const rows = await dataSource.getRepository(ExpenseCategory).find({
      where: { organizationId },
      order: { name: 'ASC' },
    });
    return rows.map((c) => this.mapCategory(c));
  }

  async upsertCategories(
    dataSource: DataSource,
    organizationId: string,
    items: Array<{
      id?: string;
      code: string;
      name: string;
      description?: string;
      isActive?: boolean;
      receiptRequiredAboveAmount?: string;
      maxAmountPerLine?: string | null;
      claimWindowDays?: number | null;
    }>,
  ) {
    return dataSource.transaction(async (em) => {
      const repo = em.getRepository(ExpenseCategory);
      const existing = await repo.find({ where: { organizationId } });
      const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id!));

      for (const row of existing) {
        if (!keepIds.has(row.id)) {
          await repo.softRemove(row);
        }
      }

      const codes = new Set<string>();
      const saved: ExpenseCategory[] = [];
      for (const item of items) {
        const code = item.code.trim().toUpperCase();
        if (codes.has(code)) {
          throw new BadRequestException(`Duplicate category code: ${code}`);
        }
        codes.add(code);

        let row = item.id
          ? existing.find((e) => e.id === item.id)
          : undefined;
        if (item.id && !row) {
          throw new BadRequestException(`Unknown category id: ${item.id}`);
        }
        if (!row) {
          row = repo.create({ organizationId });
        }
        row.code = code;
        row.name = item.name.trim();
        row.description = item.description?.trim() || null;
        row.isActive = item.isActive ?? true;
        row.receiptRequiredAboveAmount = this.normalizeMoney(
          item.receiptRequiredAboveAmount ?? '0',
        );
        row.maxAmountPerLine =
          item.maxAmountPerLine != null && item.maxAmountPerLine !== ''
            ? this.normalizeMoney(item.maxAmountPerLine)
            : null;
        row.claimWindowDays =
          item.claimWindowDays != null ? item.claimWindowDays : null;
        saved.push(await repo.save(row));
      }
      return { categories: saved.map((c) => this.mapCategory(c)) };
    });
  }

  async getPolicy(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<ExpensePolicy> {
    const settings = await dataSource.getRepository(OrganizationSetting).find({
      where: {
        key: In([
          SETTING_KEYS.EXPENSE_DEFAULT_CLAIM_WINDOW_DAYS,
          SETTING_KEYS.EXPENSE_MAX_LINES_PER_CLAIM,
          SETTING_KEYS.EXPENSE_MAX_CLAIM_AMOUNT,
          SETTING_KEYS.ORG_CURRENCY,
          SETTING_KEYS.ORG_TIMEZONE,
        ]),
      },
    });
    const map = new Map(settings.map((s) => [s.key, s.value]));
    return {
      defaultClaimWindowDays:
        Number(map.get(SETTING_KEYS.EXPENSE_DEFAULT_CLAIM_WINDOW_DAYS)) ||
        DEFAULT_CLAIM_WINDOW_DAYS,
      maxLinesPerClaim:
        Number(map.get(SETTING_KEYS.EXPENSE_MAX_LINES_PER_CLAIM)) ||
        DEFAULT_MAX_LINES,
      maxClaimAmount:
        Number(map.get(SETTING_KEYS.EXPENSE_MAX_CLAIM_AMOUNT)) ||
        DEFAULT_MAX_CLAIM_AMOUNT,
      defaultCurrency: (map.get(SETTING_KEYS.ORG_CURRENCY) || 'INR').toUpperCase(),
      timezone: resolveOrgTimezone(map.get(SETTING_KEYS.ORG_TIMEZONE)),
    };
  }

  async updatePolicy(
    dataSource: DataSource,
    dto: {
      defaultClaimWindowDays?: number;
      maxLinesPerClaim?: number;
      maxClaimAmount?: string;
    },
  ) {
    const repo = dataSource.getRepository(OrganizationSetting);
    const upsert = async (key: string, value: string) => {
      let row = await repo.findOne({ where: { key } });
      if (!row) row = repo.create({ key, value });
      else row.value = value;
      await repo.save(row);
    };
    if (dto.defaultClaimWindowDays != null) {
      await upsert(
        SETTING_KEYS.EXPENSE_DEFAULT_CLAIM_WINDOW_DAYS,
        String(dto.defaultClaimWindowDays),
      );
    }
    if (dto.maxLinesPerClaim != null) {
      await upsert(
        SETTING_KEYS.EXPENSE_MAX_LINES_PER_CLAIM,
        String(dto.maxLinesPerClaim),
      );
    }
    if (dto.maxClaimAmount != null) {
      await upsert(
        SETTING_KEYS.EXPENSE_MAX_CLAIM_AMOUNT,
        this.normalizeMoney(dto.maxClaimAmount),
      );
    }
    return this.getPolicy(dataSource, '');
  }

  // ─── Employee ESS ────────────────────────────────────────────────────

  async listOwnClaims(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    status?: ExpenseClaimStatus,
  ) {
    const where: Record<string, unknown> = { organizationId, employeeId };
    if (status) where.status = status;
    const rows = await dataSource.getRepository(ExpenseClaim).find({
      where,
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.mapClaimSummary(r));
  }

  async getOwnClaim(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    const claim = await this.findOwnClaim(
      dataSource,
      organizationId,
      employeeId,
      claimId,
    );
    return this.mapClaimDetail(dataSource, claim);
  }

  async createDraft(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    dto: CreateExpenseClaimDto,
  ) {
    await this.assertEmployeeCanClaim(dataSource, employeeId, false);
    const policy = await this.getPolicy(dataSource, organizationId);
    const currency = (dto.currency || policy.defaultCurrency).toUpperCase();
    this.assertSupportedCurrency(currency);

    return dataSource.transaction(async (em) => {
      const claimNumber = await this.nextClaimNumber(em, organizationId);
      const claim = em.getRepository(ExpenseClaim).create({
        organizationId,
        employeeId,
        claimNumber,
        title: dto.title.trim(),
        purpose: dto.purpose?.trim() || null,
        status: ExpenseClaimStatus.DRAFT,
        currency,
        totalAmount: '0.00',
      });
      const saved = await em.getRepository(ExpenseClaim).save(claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: saved.id,
        action: ExpenseClaimAuditAction.CREATED,
        actorEmployeeId: employeeId,
        fromStatus: null,
        toStatus: ExpenseClaimStatus.DRAFT,
      });
      return this.mapClaimDetail(dataSource, saved, em);
    });
  }

  async updateDraft(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
    dto: UpdateExpenseClaimDto,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findEditableClaim(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      if (dto.title != null) claim.title = dto.title.trim();
      if (dto.purpose !== undefined) {
        claim.purpose = dto.purpose?.trim() || null;
      }
      await em.getRepository(ExpenseClaim).save(claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.UPDATED,
        actorEmployeeId: employeeId,
        fromStatus: claim.status,
        toStatus: claim.status,
      });
      return this.mapClaimDetail(dataSource, claim, em);
    });
  }

  async addLine(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
    dto: CreateExpenseClaimLineDto,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findEditableClaim(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      const policy = await this.getPolicy(dataSource, organizationId);
      const lines = await em.getRepository(ExpenseClaimLine).find({
        where: { claimId: claim.id },
        order: { lineNo: 'ASC' },
      });
      if (lines.length >= policy.maxLinesPerClaim) {
        throw new BadRequestException(
          `A claim can have at most ${policy.maxLinesPerClaim} lines`,
        );
      }

      const amount = this.normalizeMoney(dto.amount);
      this.assertPositiveAmount(amount);
      const category = await this.requireActiveCategory(
        em,
        organizationId,
        dto.categoryId,
      );
      this.assertDateFormat(dto.expenseDate);

      const receiptDocumentId = await this.resolveReceiptDocument(
        em,
        organizationId,
        employeeId,
        claim.id,
        dto.receipt,
        dto.receiptDocumentId,
      );

      const line = em.getRepository(ExpenseClaimLine).create({
        organizationId,
        claimId: claim.id,
        lineNo: lines.length ? lines[lines.length - 1].lineNo + 1 : 1,
        categoryId: category.id,
        expenseDate: dto.expenseDate,
        merchant: dto.merchant.trim(),
        description: dto.description.trim(),
        amount,
        receiptDocumentId,
      });
      await em.getRepository(ExpenseClaimLine).save(line);
      await this.linkReceiptToLine(em, receiptDocumentId, line.id);
      await this.recomputeTotal(em, claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.LINE_ADDED,
        actorEmployeeId: employeeId,
        fromStatus: claim.status,
        toStatus: claim.status,
        payloadJson: { lineId: line.id, amount },
      });
      return this.mapClaimDetail(dataSource, claim, em);
    });
  }

  async updateLine(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
    lineId: string,
    dto: UpdateExpenseClaimLineDto,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findEditableClaim(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      const line = await em.getRepository(ExpenseClaimLine).findOne({
        where: { id: lineId, claimId: claim.id, organizationId },
      });
      if (!line) throw new NotFoundException('Expense line not found');

      if (dto.categoryId) {
        const category = await this.requireActiveCategory(
          em,
          organizationId,
          dto.categoryId,
        );
        line.categoryId = category.id;
      }
      if (dto.expenseDate) {
        this.assertDateFormat(dto.expenseDate);
        line.expenseDate = dto.expenseDate;
      }
      if (dto.merchant != null) line.merchant = dto.merchant.trim();
      if (dto.description != null) line.description = dto.description.trim();
      if (dto.amount != null) {
        const amount = this.normalizeMoney(dto.amount);
        this.assertPositiveAmount(amount);
        line.amount = amount;
      }
      if (dto.receipt || dto.receiptDocumentId) {
        const previousReceiptId = line.receiptDocumentId;
        const nextReceiptId = await this.resolveReceiptDocument(
          em,
          organizationId,
          employeeId,
          claim.id,
          dto.receipt,
          dto.receiptDocumentId,
        );
        if (previousReceiptId && previousReceiptId !== nextReceiptId) {
          await this.cleanupExpenseReceipt(em, previousReceiptId);
        }
        line.receiptDocumentId = nextReceiptId;
        await em.getRepository(ExpenseClaimLine).save(line);
        await this.linkReceiptToLine(em, nextReceiptId, line.id);
      } else {
        await em.getRepository(ExpenseClaimLine).save(line);
      }

      await this.recomputeTotal(em, claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.LINE_UPDATED,
        actorEmployeeId: employeeId,
        fromStatus: claim.status,
        toStatus: claim.status,
        payloadJson: { lineId: line.id },
      });
      return this.mapClaimDetail(dataSource, claim, em);
    });
  }

  async deleteLine(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
    lineId: string,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findEditableClaim(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      const line = await em.getRepository(ExpenseClaimLine).findOne({
        where: { id: lineId, claimId: claim.id, organizationId },
      });
      if (!line) throw new NotFoundException('Expense line not found');
      await this.cleanupExpenseReceipt(em, line.receiptDocumentId);
      line.receiptDocumentId = null;
      await em.getRepository(ExpenseClaimLine).softRemove(line);
      await this.recomputeTotal(em, claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.LINE_REMOVED,
        actorEmployeeId: employeeId,
        fromStatus: claim.status,
        toStatus: claim.status,
        payloadJson: { lineId },
      });
      return this.mapClaimDetail(dataSource, claim, em);
    });
  }

  async submit(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    await this.assertEmployeeCanClaim(dataSource, employeeId, true);
    return dataSource.transaction(async (em) => {
      const claim = await this.findEditableClaim(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      await this.validateForSubmit(em, dataSource, organizationId, claim);

      const managerId = await this.resolveManagerForSubmit(
        dataSource,
        em,
        employeeId,
      );
      const fromStatus = claim.status;
      claim.status = ExpenseClaimStatus.PENDING_MANAGER;
      claim.managerEmployeeId = managerId;
      claim.submittedAt = new Date();
      claim.sendBackReason = null;
      claim.sendBackAt = null;
      claim.sendBackByEmployeeId = null;
      claim.rejectionReason = null;
      claim.rejectedAt = null;
      claim.rejectedByEmployeeId = null;
      await em.getRepository(ExpenseClaim).save(claim);

      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.SUBMITTED,
        actorEmployeeId: employeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.PENDING_MANAGER,
      });

      await this.notify(
        em,
        organizationId,
        managerId,
        EmployeeNotificationType.EXPENSE_PENDING_MANAGER,
        'Expense claim pending approval',
        `Claim ${claim.claimNumber} is waiting for your approval.`,
        claim.id,
      );

      return this.mapClaimDetail(dataSource, claim, em);
    });
  }

  async withdraw(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findOwnClaimEm(
        em,
        organizationId,
        employeeId,
        claimId,
      );
      const allowed = new Set([
        ExpenseClaimStatus.DRAFT,
        ExpenseClaimStatus.SENT_BACK,
        ExpenseClaimStatus.PENDING_MANAGER,
        ExpenseClaimStatus.PENDING_FINANCE,
      ]);
      if (!allowed.has(claim.status)) {
        throw new ConflictException(
          'Only draft, sent-back, or pending claims can be withdrawn',
        );
      }
      const fromStatus = claim.status;
      claim.status = ExpenseClaimStatus.WITHDRAWN;
      await em.getRepository(ExpenseClaim).save(claim);
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.WITHDRAWN,
        actorEmployeeId: employeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.WITHDRAWN,
      });
      return { success: true, status: claim.status };
    });
  }

  async getReceiptDownload(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    lineId: string,
    mode: 'owner' | 'manager' | 'finance',
  ) {
    const documentId = await this.resolveReceiptDocumentId(
      dataSource,
      organizationId,
      actorEmployeeId,
      claimId,
      lineId,
      mode,
    );
    return this.storageService.getExpenseReceiptDownload(
      dataSource,
      organizationId,
      documentId,
      'download',
    );
  }

  async getReceiptPreview(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    lineId: string,
    mode: 'owner' | 'manager' | 'finance',
  ) {
    const documentId = await this.resolveReceiptDocumentId(
      dataSource,
      organizationId,
      actorEmployeeId,
      claimId,
      lineId,
      mode,
    );
    return this.storageService.getExpenseReceiptDownload(
      dataSource,
      organizationId,
      documentId,
      'preview',
    );
  }

  private async resolveReceiptDocumentId(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    lineId: string,
    mode: 'owner' | 'manager' | 'finance',
  ): Promise<string> {
    const claim = await dataSource.getRepository(ExpenseClaim).findOne({
      where: { id: claimId, organizationId },
    });
    if (!claim) throw new NotFoundException('Expense claim not found');

    if (mode === 'owner' && claim.employeeId !== actorEmployeeId) {
      throw new ForbiddenException('Not allowed to view this receipt');
    }
    if (mode === 'manager') {
      await this.assertCanViewAsManager(
        dataSource,
        organizationId,
        actorEmployeeId,
        claim,
      );
    }

    const line = await dataSource.getRepository(ExpenseClaimLine).findOne({
      where: { id: lineId, claimId: claim.id, organizationId },
    });
    if (!line?.receiptDocumentId) {
      throw new NotFoundException('Receipt not found');
    }
    return line.receiptDocumentId;
  }

  // ─── Manager approvals ───────────────────────────────────────────────

  async listPendingManager(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ) {
    const rows = await this.findPendingManagerRows(
      dataSource,
      organizationId,
      approverEmployeeId,
    );
    return Promise.all(
      rows.map(async (row) => {
        const labels = await this.resolveEmployeeOrgLabels(
          dataSource,
          row.employee,
        );
        return {
          id: row.id,
          claimNumber: row.claimNumber,
          title: row.title,
          totalAmount: row.totalAmount,
          currency: row.currency,
          submittedAt: row.submittedAt?.toISOString() ?? null,
          employeeName: row.employee?.name ?? 'Employee',
          employeeCode: row.employee?.employeeCode,
          departmentName: labels.departmentName,
        };
      }),
    );
  }

  async getManagerDetail(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
  ) {
    const claim = await this.findClaimForManagerView(
      dataSource,
      organizationId,
      approverEmployeeId,
      claimId,
    );
    return this.mapClaimDetail(dataSource, claim);
  }

  async managerApprove(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
    notes?: string,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await this.findPendingManagerForAct(
        em,
        dataSource,
        organizationId,
        approverEmployeeId,
        claimId,
      );
      const fromStatus = claim.status;
      const result = await em
        .getRepository(ExpenseClaim)
        .createQueryBuilder()
        .update(ExpenseClaim)
        .set({
          status: ExpenseClaimStatus.PENDING_FINANCE,
          managerActionAt: new Date(),
          managerNotes: notes?.trim() || null,
          managerEmployeeId: claim.managerEmployeeId || approverEmployeeId,
        })
        .where('id = :id AND status = :status', {
          id: claim.id,
          status: ExpenseClaimStatus.PENDING_MANAGER,
        })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Claim was already actioned by someone else');
      }

      claim.status = ExpenseClaimStatus.PENDING_FINANCE;
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.MANAGER_APPROVED,
        actorEmployeeId: approverEmployeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.PENDING_FINANCE,
        payloadJson: { notes },
      });

      await this.notifyFinanceActors(
        em,
        dataSource,
        organizationId,
        claim,
      );

      return { success: true, status: claim.status };
    });
  }

  async managerReject(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
    reason?: string,
  ) {
    return this.rejectClaim(
      dataSource,
      organizationId,
      approverEmployeeId,
      claimId,
      reason,
      'manager',
    );
  }

  async managerSendBack(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
    reason: string,
  ) {
    return this.sendBackClaim(
      dataSource,
      organizationId,
      approverEmployeeId,
      claimId,
      reason,
      'manager',
    );
  }

  // ─── Finance ─────────────────────────────────────────────────────────

  async listFinancePending(dataSource: DataSource, organizationId: string) {
    const rows = await dataSource.getRepository(ExpenseClaim).find({
      where: {
        organizationId,
        status: ExpenseClaimStatus.PENDING_FINANCE,
      },
      relations: ['employee', 'employee.departmentRef'],
      order: { submittedAt: 'ASC' },
    });
    return Promise.all(rows.map((r) => this.mapFinanceListItem(dataSource, r)));
  }

  async listPayable(dataSource: DataSource, organizationId: string) {
    const rows = await dataSource.getRepository(ExpenseClaim).find({
      where: { organizationId, status: ExpenseClaimStatus.APPROVED },
      relations: ['employee', 'employee.departmentRef'],
      order: { approvedAt: 'ASC' },
    });
    return Promise.all(rows.map((r) => this.mapFinanceListItem(dataSource, r)));
  }

  async getFinanceDetail(
    dataSource: DataSource,
    organizationId: string,
    claimId: string,
  ) {
    const claim = await dataSource.getRepository(ExpenseClaim).findOne({
      where: { id: claimId, organizationId },
      relations: ['employee', 'manager', 'financeActor', 'paidBy'],
    });
    if (!claim) throw new NotFoundException('Expense claim not found');
    return this.mapClaimDetail(dataSource, claim);
  }

  async financeApprove(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    notes?: string,
  ) {
    return dataSource.transaction(async (em) => {
      const claim = await em.getRepository(ExpenseClaim).findOne({
        where: {
          id: claimId,
          organizationId,
          status: ExpenseClaimStatus.PENDING_FINANCE,
        },
      });
      if (!claim) {
        throw new ConflictException('Claim is not pending finance approval');
      }
      const fromStatus = claim.status;
      const result = await em
        .getRepository(ExpenseClaim)
        .createQueryBuilder()
        .update(ExpenseClaim)
        .set({
          status: ExpenseClaimStatus.APPROVED,
          financeActorEmployeeId: actorEmployeeId,
          financeActionAt: new Date(),
          financeNotes: notes?.trim() || null,
          approvedAt: new Date(),
        })
        .where('id = :id AND status = :status', {
          id: claim.id,
          status: ExpenseClaimStatus.PENDING_FINANCE,
        })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Claim was already actioned by someone else');
      }
      claim.status = ExpenseClaimStatus.APPROVED;
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.FINANCE_APPROVED,
        actorEmployeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.APPROVED,
        payloadJson: { notes },
      });
      await this.notify(
        em,
        organizationId,
        claim.employeeId,
        EmployeeNotificationType.EXPENSE_APPROVED,
        'Expense claim approved',
        `Claim ${claim.claimNumber} was approved and is ready for payment.`,
        claim.id,
      );
      return { success: true, status: claim.status };
    });
  }

  async financeReject(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    reason?: string,
  ) {
    return this.rejectClaim(
      dataSource,
      organizationId,
      actorEmployeeId,
      claimId,
      reason,
      'finance',
    );
  }

  async financeSendBack(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    reason: string,
  ) {
    return this.sendBackClaim(
      dataSource,
      organizationId,
      actorEmployeeId,
      claimId,
      reason,
      'finance',
    );
  }

  async markPaid(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    dto: MarkExpensePaidDto,
  ) {
    const mode = dto.paymentMode?.toUpperCase() as ExpensePaymentMode;
    if (!Object.values(ExpensePaymentMode).includes(mode)) {
      throw new BadRequestException('Invalid payment mode');
    }
    const ref = dto.paymentReference?.trim();
    if (!ref) {
      throw new BadRequestException('Payment reference is required');
    }
    this.assertDateFormat(dto.paidAt);

    return dataSource.transaction(async (em) => {
      const claim = await em.getRepository(ExpenseClaim).findOne({
        where: {
          id: claimId,
          organizationId,
          status: ExpenseClaimStatus.APPROVED,
        },
      });
      if (!claim) {
        throw new ConflictException('Only approved claims can be marked paid');
      }
      const fromStatus = claim.status;
      const paidAt = new Date(`${dto.paidAt}T00:00:00.000Z`);
      const result = await em
        .getRepository(ExpenseClaim)
        .createQueryBuilder()
        .update(ExpenseClaim)
        .set({
          status: ExpenseClaimStatus.PAID,
          paidAt,
          paidByEmployeeId: actorEmployeeId,
          paymentReference: ref,
          paymentMode: mode,
        })
        .where('id = :id AND status = :status', {
          id: claim.id,
          status: ExpenseClaimStatus.APPROVED,
        })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Claim was already marked paid');
      }
      claim.status = ExpenseClaimStatus.PAID;
      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.MARKED_PAID,
        actorEmployeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.PAID,
        payloadJson: {
          paymentReference: ref,
          paymentMode: mode,
          paidAt: dto.paidAt,
        },
      });
      await this.notify(
        em,
        organizationId,
        claim.employeeId,
        EmployeeNotificationType.EXPENSE_PAID,
        'Expense claim paid',
        `Claim ${claim.claimNumber} was marked as paid (ref: ${ref}).`,
        claim.id,
      );
      return { success: true, status: claim.status };
    });
  }

  async exportCsv(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    status?: 'APPROVED' | 'PAID' | 'BOTH',
  ): Promise<string> {
    const statuses =
      status === 'PAID'
        ? [ExpenseClaimStatus.PAID]
        : status === 'APPROVED'
          ? [ExpenseClaimStatus.APPROVED]
          : [ExpenseClaimStatus.APPROVED, ExpenseClaimStatus.PAID];

    const claims = await dataSource.getRepository(ExpenseClaim).find({
      where: { organizationId, status: In(statuses) },
      relations: ['employee'],
      order: { approvedAt: 'DESC', paidAt: 'DESC' },
    });

    const lines = await dataSource.getRepository(ExpenseClaimLine).find({
      where: { claimId: In(claims.map((c) => c.id)), organizationId },
      relations: ['category'],
      order: { lineNo: 'ASC' },
    });
    const linesByClaim = new Map<string, ExpenseClaimLine[]>();
    for (const line of lines) {
      const arr = linesByClaim.get(line.claimId) || [];
      arr.push(line);
      linesByClaim.set(line.claimId, arr);
    }

    const header = [
      'claimNumber',
      'employeeCode',
      'employeeName',
      'status',
      'currency',
      'totalAmount',
      'lineNo',
      'category',
      'expenseDate',
      'merchant',
      'amount',
      'paymentReference',
      'paymentMode',
      'paidAt',
    ];
    const rows: string[][] = [header];
    for (const claim of claims) {
      const claimLines = linesByClaim.get(claim.id) || [];
      if (!claimLines.length) {
        rows.push([
          claim.claimNumber,
          claim.employee?.employeeCode || '',
          claim.employee?.name || '',
          claim.status,
          claim.currency,
          claim.totalAmount,
          '',
          '',
          '',
          '',
          '',
          claim.paymentReference || '',
          claim.paymentMode || '',
          claim.paidAt ? claim.paidAt.toISOString().slice(0, 10) : '',
        ]);
        continue;
      }
      for (const line of claimLines) {
        rows.push([
          claim.claimNumber,
          claim.employee?.employeeCode || '',
          claim.employee?.name || '',
          claim.status,
          claim.currency,
          claim.totalAmount,
          String(line.lineNo),
          line.category?.name || '',
          this.toDateKey(line.expenseDate),
          line.merchant,
          line.amount,
          claim.paymentReference || '',
          claim.paymentMode || '',
          claim.paidAt ? claim.paidAt.toISOString().slice(0, 10) : '',
        ]);
      }
    }

    if (claims[0]?.id) {
      await this.writeAudit(dataSource.manager, {
        organizationId,
        claimId: claims[0].id,
        action: ExpenseClaimAuditAction.EXPORTED,
        actorEmployeeId,
        fromStatus: null,
        toStatus: null,
        payloadJson: { count: claims.length, status: status || 'BOTH' },
      });
    }

    return rows.map((r) => r.map((c) => this.csvEscape(c)).join(',')).join('\n');
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private async rejectClaim(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    reason: string | undefined,
    role: 'manager' | 'finance',
  ) {
    const expected =
      role === 'manager'
        ? ExpenseClaimStatus.PENDING_MANAGER
        : ExpenseClaimStatus.PENDING_FINANCE;

    return dataSource.transaction(async (em) => {
      let claim: ExpenseClaim;
      if (role === 'manager') {
        claim = await this.findPendingManagerForAct(
          em,
          dataSource,
          organizationId,
          actorEmployeeId,
          claimId,
        );
      } else {
        const row = await em.getRepository(ExpenseClaim).findOne({
          where: { id: claimId, organizationId, status: expected },
        });
        if (!row) {
          throw new ConflictException('Claim is not pending finance approval');
        }
        claim = row;
      }

      const fromStatus = claim.status;
      const rejectionReason =
        reason?.trim() || 'Rejected without additional reason';
      const result = await em
        .getRepository(ExpenseClaim)
        .createQueryBuilder()
        .update(ExpenseClaim)
        .set({
          status: ExpenseClaimStatus.REJECTED,
          rejectionReason,
          rejectedByEmployeeId: actorEmployeeId,
          rejectedAt: new Date(),
          ...(role === 'manager'
            ? {
                managerActionAt: new Date(),
                managerNotes: rejectionReason,
              }
            : {
                financeActorEmployeeId: actorEmployeeId,
                financeActionAt: new Date(),
                financeNotes: rejectionReason,
              }),
        })
        .where('id = :id AND status = :status', {
          id: claim.id,
          status: expected,
        })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Claim was already actioned by someone else');
      }

      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.REJECTED,
        actorEmployeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.REJECTED,
        payloadJson: { reason: rejectionReason, role },
      });
      await this.notify(
        em,
        organizationId,
        claim.employeeId,
        EmployeeNotificationType.EXPENSE_REJECTED,
        'Expense claim rejected',
        `Claim ${claim.claimNumber} was rejected: ${rejectionReason}`,
        claim.id,
      );
      return { success: true, status: ExpenseClaimStatus.REJECTED };
    });
  }

  private async sendBackClaim(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    claimId: string,
    reason: string,
    role: 'manager' | 'finance',
  ) {
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 3) {
      throw new BadRequestException('Send-back reason is required');
    }
    const expected =
      role === 'manager'
        ? ExpenseClaimStatus.PENDING_MANAGER
        : ExpenseClaimStatus.PENDING_FINANCE;

    return dataSource.transaction(async (em) => {
      let claim: ExpenseClaim;
      if (role === 'manager') {
        claim = await this.findPendingManagerForAct(
          em,
          dataSource,
          organizationId,
          actorEmployeeId,
          claimId,
        );
      } else {
        const row = await em.getRepository(ExpenseClaim).findOne({
          where: { id: claimId, organizationId, status: expected },
        });
        if (!row) {
          throw new ConflictException('Claim is not pending finance approval');
        }
        claim = row;
      }

      const fromStatus = claim.status;
      const result = await em
        .getRepository(ExpenseClaim)
        .createQueryBuilder()
        .update(ExpenseClaim)
        .set({
          status: ExpenseClaimStatus.SENT_BACK,
          sendBackReason: trimmed,
          sendBackByEmployeeId: actorEmployeeId,
          sendBackAt: new Date(),
        })
        .where('id = :id AND status = :status', {
          id: claim.id,
          status: expected,
        })
        .execute();
      if (!result.affected) {
        throw new ConflictException('Claim was already actioned by someone else');
      }

      await this.writeAudit(em, {
        organizationId,
        claimId: claim.id,
        action: ExpenseClaimAuditAction.SENT_BACK,
        actorEmployeeId,
        fromStatus,
        toStatus: ExpenseClaimStatus.SENT_BACK,
        payloadJson: { reason: trimmed, role },
      });
      await this.notify(
        em,
        organizationId,
        claim.employeeId,
        EmployeeNotificationType.EXPENSE_SENT_BACK,
        'Expense claim sent back',
        `Claim ${claim.claimNumber} was sent back for revision: ${trimmed}`,
        claim.id,
      );
      return { success: true, status: ExpenseClaimStatus.SENT_BACK };
    });
  }

  private async validateForSubmit(
    em: EntityManager,
    dataSource: DataSource,
    organizationId: string,
    claim: ExpenseClaim,
  ) {
    const policy = await this.getPolicy(dataSource, organizationId);
    const lines = await em.getRepository(ExpenseClaimLine).find({
      where: { claimId: claim.id, organizationId },
      relations: ['category'],
    });
    if (!lines.length) {
      throw new BadRequestException('Add at least one expense line before submit');
    }
    if (lines.length > policy.maxLinesPerClaim) {
      throw new BadRequestException(
        `A claim can have at most ${policy.maxLinesPerClaim} lines`,
      );
    }

    let total = 0;
    const today = orgDateKeyForInstant(new Date(), policy.timezone);

    for (const line of lines) {
      const amount = Number(line.amount);
      if (!(amount > 0)) {
        throw new BadRequestException(`Line ${line.lineNo} amount must be positive`);
      }
      total += amount;

      const category =
        line.category ||
        (await em.getRepository(ExpenseCategory).findOne({
          where: { id: line.categoryId, organizationId },
        }));
      if (!category || !category.isActive) {
        throw new BadRequestException(
          `Line ${line.lineNo} uses an inactive or missing category`,
        );
      }

      const expenseDate = this.toDateKey(line.expenseDate);
      if (expenseDate > today) {
        throw new BadRequestException(
          `Line ${line.lineNo} expense date cannot be in the future`,
        );
      }
      const windowDays =
        category.claimWindowDays ?? policy.defaultClaimWindowDays;
      const minDate = this.addDays(today, -windowDays);
      if (expenseDate < minDate) {
        throw new BadRequestException(
          `Line ${line.lineNo} is outside the ${windowDays}-day claim window`,
        );
      }

      if (
        category.maxAmountPerLine != null &&
        amount > Number(category.maxAmountPerLine)
      ) {
        throw new BadRequestException(
          `Line ${line.lineNo} exceeds max amount for category ${category.name}`,
        );
      }

      const threshold = Number(category.receiptRequiredAboveAmount ?? 0);
      if (amount >= threshold && !line.receiptDocumentId) {
        throw new BadRequestException(
          `Line ${line.lineNo} requires a receipt`,
        );
      }

      // Exact duplicate hard block
      const dup = await em
        .getRepository(ExpenseClaimLine)
        .createQueryBuilder('l')
        .innerJoin(ExpenseClaim, 'c', 'c.id = l.claimId')
        .where('l.organizationId = :organizationId', { organizationId })
        .andWhere('c.employeeId = :employeeId', {
          employeeId: claim.employeeId,
        })
        .andWhere('c.status IN (:...statuses)', {
          statuses: NON_TERMINAL_STATUSES,
        })
        .andWhere('l.expenseDate = :expenseDate', { expenseDate })
        .andWhere('l.amount = :amount', { amount: line.amount })
        .andWhere('LOWER(TRIM(l.merchant)) = :merchant', {
          merchant: line.merchant.trim().toLowerCase(),
        })
        .andWhere('l.id != :lineId', { lineId: line.id })
        .andWhere('l.deletedAt IS NULL')
        .andWhere('c.deletedAt IS NULL')
        .getOne();
      if (dup) {
        throw new ConflictException(
          `Duplicate expense detected for ${line.merchant} on ${expenseDate} (${line.amount})`,
        );
      }
    }

    if (total > policy.maxClaimAmount) {
      throw new BadRequestException(
        `Claim total exceeds maximum of ${policy.maxClaimAmount}`,
      );
    }

    await this.recomputeTotal(em, claim);
  }

  private async resolveManagerForSubmit(
    dataSource: DataSource,
    em: EntityManager,
    employeeId: string,
  ): Promise<string> {
    const reportingManagerId =
      await this.reportingManagersService.getActiveReportingManagerId(
        dataSource,
        employeeId,
      );

    const empRepo = em.getRepository(Employee);
    let managerId = reportingManagerId;

    if (managerId === employeeId) {
      managerId = null as unknown as string;
    }

    if (managerId) {
      const manager = await empRepo.findOne({ where: { id: managerId } });
      if (
        manager &&
        [EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_ACTIVATION].includes(
          manager.status,
        )
      ) {
        return manager.id;
      }
    }

    const admins = await empRepo.find({
      where: {
        role: EmployeeRole.ORG_ADMIN,
        status: In([EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_ACTIVATION]),
      },
      order: { name: 'ASC' },
    });
    const alternate = admins.find((a) => a.id !== employeeId);
    if (!alternate) {
      throw new BadRequestException(
        'No approver is available. Assign a reporting manager or ensure an org admin exists.',
      );
    }
    return alternate.id;
  }

  private async findPendingManagerRows(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
  ): Promise<ExpenseClaim[]> {
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    const relations = [
      'employee',
      'employee.departmentRef',
      'employee.designationRef',
    ];

    let rows = await dataSource.getRepository(ExpenseClaim).find({
      where: {
        organizationId,
        managerEmployeeId: approverEmployeeId,
        status: ExpenseClaimStatus.PENDING_MANAGER,
      },
      relations,
      order: { submittedAt: 'ASC' },
    });

    if (this.rbacConfig.isScopeV2Enabled()) {
      const scope = auth.permissionScopes.get(MANAGER_READ) ?? AccessScope.SELF;
      if (scope === AccessScope.ORGANIZATION || scope === AccessScope.GLOBAL) {
        rows = await dataSource.getRepository(ExpenseClaim).find({
          where: {
            organizationId,
            status: ExpenseClaimStatus.PENDING_MANAGER,
          },
          relations,
          order: { submittedAt: 'ASC' },
        });
      } else {
        const visibleIds =
          await this.employeeScopeService.getVisibleEmployeeIds(
            dataSource,
            approverEmployeeId,
            MANAGER_READ,
            auth,
          );
        if (visibleIds === null) {
          rows = await dataSource.getRepository(ExpenseClaim).find({
            where: {
              organizationId,
              status: ExpenseClaimStatus.PENDING_MANAGER,
            },
            relations,
            order: { submittedAt: 'ASC' },
          });
        } else if (visibleIds.length) {
          const scoped = await dataSource.getRepository(ExpenseClaim).find({
            where: {
              organizationId,
              status: ExpenseClaimStatus.PENDING_MANAGER,
              employeeId: In(visibleIds),
            },
            relations,
            order: { submittedAt: 'ASC' },
          });
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const r of scoped) byId.set(r.id, r);
          rows = [...byId.values()];
        }
      }
    }
    return rows;
  }

  private async findPendingManagerForAct(
    em: EntityManager,
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
  ): Promise<ExpenseClaim> {
    const claim = await em.getRepository(ExpenseClaim).findOne({
      where: {
        id: claimId,
        organizationId,
        status: ExpenseClaimStatus.PENDING_MANAGER,
      },
    });
    if (!claim) {
      throw new ConflictException('Claim is not pending manager approval');
    }
    await this.assertCanActAsManager(
      dataSource,
      organizationId,
      approverEmployeeId,
      claim,
    );
    return claim;
  }

  private async findClaimForManagerView(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claimId: string,
  ) {
    const claim = await dataSource.getRepository(ExpenseClaim).findOne({
      where: { id: claimId, organizationId },
      relations: ['employee', 'manager'],
    });
    if (!claim) throw new NotFoundException('Expense claim not found');
    await this.assertCanViewAsManager(
      dataSource,
      organizationId,
      approverEmployeeId,
      claim,
    );
    return claim;
  }

  private async assertCanViewAsManager(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claim: ExpenseClaim,
  ) {
    if (claim.managerEmployeeId === approverEmployeeId) return;
    if (!this.rbacConfig.isScopeV2Enabled()) {
      throw new ForbiddenException('Not allowed to view this claim');
    }
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    if (!auth.permissions.includes(MANAGER_READ)) {
      throw new ForbiddenException('Missing expense approval read permission');
    }
    const scope = auth.permissionScopes.get(MANAGER_READ) ?? AccessScope.SELF;
    if (scope === AccessScope.ORGANIZATION || scope === AccessScope.GLOBAL) {
      return;
    }
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      MANAGER_READ,
      auth,
    );
    if (visibleIds === null || visibleIds.includes(claim.employeeId)) return;
    throw new ForbiddenException('Not allowed to view this claim');
  }

  private async assertCanActAsManager(
    dataSource: DataSource,
    organizationId: string,
    approverEmployeeId: string,
    claim: ExpenseClaim,
  ) {
    if (claim.managerEmployeeId === approverEmployeeId) return;
    if (!this.rbacConfig.isScopeV2Enabled()) {
      throw new ForbiddenException('Not allowed to act on this claim');
    }
    const auth = await this.authorizationService.resolve({
      employeeId: approverEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    if (!auth.permissions.includes(MANAGER_ACT)) {
      throw new ForbiddenException('Missing expense approval act permission');
    }
    const scope = auth.permissionScopes.get(MANAGER_ACT) ?? AccessScope.SELF;
    if (scope === AccessScope.ORGANIZATION || scope === AccessScope.GLOBAL) {
      return;
    }
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      approverEmployeeId,
      MANAGER_ACT,
      auth,
    );
    if (visibleIds === null || visibleIds.includes(claim.employeeId)) return;
    throw new ForbiddenException('Not allowed to act on this claim');
  }

  private async notifyFinanceActors(
    em: EntityManager,
    dataSource: DataSource,
    organizationId: string,
    claim: ExpenseClaim,
  ) {
    // Notify HR admins / org admins who typically hold finance rights.
    // Custom-role finance users still see the queue via permission; inbox notify is best-effort.
    const recipients = await em.getRepository(Employee).find({
      where: {
        role: In([EmployeeRole.ORG_ADMIN]),
        status: In([EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_ACTIVATION]),
      },
    });
    const hrLike = await dataSource.query(
      `SELECT DISTINCT era."employeeId" AS id
       FROM rbac_employee_role_assignments era
       INNER JOIN rbac_roles r ON r.id = era."roleId"
       WHERE r.code IN ('HR_ADMIN', 'ORG_ADMIN')
         AND era."deletedAt" IS NULL
         AND r."deletedAt" IS NULL`,
    ).catch(() => [] as Array<{ id: string }>);

    const ids = new Set<string>([
      ...recipients.map((r) => r.id),
      ...hrLike.map((r: { id: string }) => r.id),
    ]);
    ids.delete(claim.employeeId);

    for (const id of ids) {
      await this.notify(
        em,
        organizationId,
        id,
        EmployeeNotificationType.EXPENSE_PENDING_FINANCE,
        'Expense claim pending finance',
        `Claim ${claim.claimNumber} is waiting for finance review.`,
        claim.id,
      );
    }
  }

  private async notify(
    em: EntityManager,
    organizationId: string,
    recipientEmployeeId: string,
    type: EmployeeNotificationType,
    title: string,
    body: string,
    expenseClaimId: string,
  ) {
    await em.getRepository(EmployeeNotification).save(
      em.getRepository(EmployeeNotification).create({
        organizationId,
        recipientEmployeeId,
        type,
        title,
        body,
        expenseClaimId,
      }),
    );
  }

  private async writeAudit(
    em: EntityManager,
    params: {
      organizationId: string;
      claimId: string;
      action: ExpenseClaimAuditAction;
      actorEmployeeId: string | null;
      fromStatus: string | null;
      toStatus: string | null;
      payloadJson?: Record<string, unknown>;
    },
  ) {
    if (
      params.claimId === '00000000-0000-0000-0000-000000000000' ||
      !params.claimId
    ) {
      return;
    }
    await em.getRepository(ExpenseClaimAuditLog).save(
      em.getRepository(ExpenseClaimAuditLog).create({
        organizationId: params.organizationId,
        claimId: params.claimId,
        action: params.action,
        actorEmployeeId: params.actorEmployeeId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        payloadJson: params.payloadJson ?? null,
      }),
    );
  }

  private async resolveReceiptDocument(
    em: EntityManager,
    organizationId: string,
    employeeId: string,
    claimId: string,
    receipt?: ExpenseReceiptDto,
    receiptDocumentId?: string,
  ): Promise<string | null> {
    if (receiptDocumentId) {
      const existing = await em.getRepository(ExpenseReceipt).findOne({
        where: {
          id: receiptDocumentId,
          organizationId,
          employeeId,
        },
      });
      if (!existing) {
        throw new BadRequestException('Receipt document not found');
      }
      if (existing.claimId && existing.claimId !== claimId) {
        throw new BadRequestException('Receipt does not belong to this claim');
      }
      return existing.id;
    }
    if (!receipt) return null;

    let finalKey: string;
    try {
      finalKey = await this.storageService.finalizeExpenseReceipt(
        organizationId,
        employeeId,
        claimId,
        receipt.storageKey,
        receipt.fileName,
      );
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid receipt storage key',
      );
    }

    const duplicateKey = await em.getRepository(ExpenseReceipt).findOne({
      where: { storageKey: finalKey },
    });
    if (duplicateKey) {
      throw new BadRequestException('Receipt storage key is already in use');
    }

    const saved = await em.getRepository(ExpenseReceipt).save(
      em.getRepository(ExpenseReceipt).create({
        organizationId,
        employeeId,
        claimId,
        claimLineId: null,
        fileName: receipt.fileName,
        mimeType: receipt.mimeType,
        sizeBytes: Number(receipt.sizeBytes) || 0,
        storageDriver: STORAGE_DRIVERS.S3,
        storageKey: finalKey,
        uploadedBy: employeeId,
        verificationStatus: 'PENDING',
      }),
    );
    return saved.id;
  }

  private async linkReceiptToLine(
    em: EntityManager,
    receiptId: string | null | undefined,
    claimLineId: string,
  ) {
    if (!receiptId) return;
    await em.getRepository(ExpenseReceipt).update(
      { id: receiptId },
      { claimLineId },
    );
  }

  private async cleanupExpenseReceipt(
    em: EntityManager,
    receiptId: string | null | undefined,
  ) {
    if (!receiptId) return;
    const receipt = await em.getRepository(ExpenseReceipt).findOne({
      where: { id: receiptId },
    });
    if (!receipt) return;
    if (receipt.storageDriver === STORAGE_DRIVERS.S3 && receipt.storageKey) {
      await this.storageService.deleteStorageKey(receipt.storageKey);
    }
    await em.getRepository(ExpenseReceipt).softRemove(receipt);
  }

  private async recomputeTotal(em: EntityManager, claim: ExpenseClaim) {
    const lines = await em.getRepository(ExpenseClaimLine).find({
      where: { claimId: claim.id },
    });
    const total = lines.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    claim.totalAmount = total.toFixed(2);
    await em.getRepository(ExpenseClaim).save(claim);
  }

  private async nextClaimNumber(
    em: EntityManager,
    organizationId: string,
  ): Promise<string> {
    const now = new Date();
    const ym = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const prefix = `EXP-${ym}-`;
    const latest = await em
      .getRepository(ExpenseClaim)
      .createQueryBuilder('c')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('c.claimNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('c.claimNumber', 'DESC')
      .getOne();
    let seq = 1;
    if (latest?.claimNumber) {
      const part = latest.claimNumber.slice(prefix.length);
      const n = Number(part);
      if (Number.isFinite(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async ensureDefaultCategories(
    dataSource: DataSource,
    organizationId: string,
  ) {
    const repo = dataSource.getRepository(ExpenseCategory);
    const count = await repo.count({ where: { organizationId } });
    if (count > 0) return;
    const defaults = [
      { code: 'TRAVEL', name: 'Travel' },
      { code: 'MEALS', name: 'Meals' },
      { code: 'LOCAL_CONVEYANCE', name: 'Local Conveyance' },
      { code: 'INTERNET', name: 'Internet' },
      { code: 'OTHER', name: 'Other' },
    ];
    for (const d of defaults) {
      await repo.save(
        repo.create({
          organizationId,
          code: d.code,
          name: d.name,
          isActive: true,
          receiptRequiredAboveAmount: '0.00',
        }),
      );
    }
  }

  private async findOwnClaim(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    const claim = await dataSource.getRepository(ExpenseClaim).findOne({
      where: { id: claimId, organizationId, employeeId },
      relations: ['manager', 'financeActor', 'paidBy'],
    });
    if (!claim) throw new NotFoundException('Expense claim not found');
    return claim;
  }

  private async findOwnClaimEm(
    em: EntityManager,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    const claim = await em.getRepository(ExpenseClaim).findOne({
      where: { id: claimId, organizationId, employeeId },
    });
    if (!claim) throw new NotFoundException('Expense claim not found');
    return claim;
  }

  private async findEditableClaim(
    em: EntityManager,
    organizationId: string,
    employeeId: string,
    claimId: string,
  ) {
    const claim = await this.findOwnClaimEm(
      em,
      organizationId,
      employeeId,
      claimId,
    );
    if (!EDITABLE_STATUSES.has(claim.status)) {
      throw new ConflictException(
        'Only draft or sent-back claims can be edited',
      );
    }
    return claim;
  }

  private async requireActiveCategory(
    em: EntityManager,
    organizationId: string,
    categoryId: string,
  ) {
    const category = await em.getRepository(ExpenseCategory).findOne({
      where: { id: categoryId, organizationId, isActive: true },
    });
    if (!category) {
      throw new BadRequestException('Category is inactive or not found');
    }
    return category;
  }

  private async assertEmployeeCanClaim(
    dataSource: DataSource,
    employeeId: string,
    requireActive: boolean,
  ) {
    const emp = await dataSource.getRepository(Employee).findOne({
      where: { id: employeeId },
    });
    if (!emp) {
      throw new ForbiddenException('Employee not found');
    }
    if (requireActive && emp.status !== EmployeeStatus.ACTIVE) {
      throw new ForbiddenException('Only active employees can submit claims');
    }
    if (
      !requireActive &&
      ![EmployeeStatus.ACTIVE, EmployeeStatus.PENDING_ACTIVATION].includes(
        emp.status,
      )
    ) {
      throw new ForbiddenException('Employee cannot create expense claims');
    }
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

  private async mapFinanceListItem(dataSource: DataSource, row: ExpenseClaim) {
    const labels = await this.resolveEmployeeOrgLabels(dataSource, row.employee);
    return {
      id: row.id,
      claimNumber: row.claimNumber,
      title: row.title,
      totalAmount: row.totalAmount,
      currency: row.currency,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      employeeName: row.employee?.name ?? 'Employee',
      employeeCode: row.employee?.employeeCode,
      departmentName: labels.departmentName,
    };
  }

  private mapCategory(c: ExpenseCategory) {
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description ?? undefined,
      isActive: c.isActive,
      receiptRequiredAboveAmount: c.receiptRequiredAboveAmount,
      maxAmountPerLine: c.maxAmountPerLine ?? undefined,
      claimWindowDays: c.claimWindowDays ?? undefined,
    };
  }

  private mapClaimSummary(c: ExpenseClaim) {
    return {
      id: c.id,
      claimNumber: c.claimNumber,
      title: c.title,
      status: c.status,
      currency: c.currency,
      totalAmount: c.totalAmount,
      submittedAt: c.submittedAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      paidAt: c.paidAt?.toISOString() ?? null,
      createdAt: c.createdAt?.toISOString?.() ?? null,
    };
  }

  private async mapClaimDetail(
    dataSource: DataSource,
    claim: ExpenseClaim,
    em?: EntityManager,
  ) {
    const manager = em ?? dataSource.manager;
    const lines = await manager.getRepository(ExpenseClaimLine).find({
      where: { claimId: claim.id },
      relations: ['category', 'receiptDocument'],
      order: { lineNo: 'ASC' },
    });
    const audits = await manager.getRepository(ExpenseClaimAuditLog).find({
      where: { claimId: claim.id },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    let employee = claim.employee ?? null;
    if (!employee && claim.employeeId) {
      employee = await manager.getRepository(Employee).findOne({
        where: { id: claim.employeeId },
      });
    }
    const labels = await this.resolveEmployeeOrgLabels(dataSource, employee);

    return {
      ...this.mapClaimSummary(claim),
      purpose: claim.purpose ?? undefined,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name ?? 'Employee',
            employeeCode: employee.employeeCode ?? undefined,
            departmentName: labels.departmentName,
            designationName: labels.designationName,
          }
        : undefined,
      managerEmployeeId: claim.managerEmployeeId ?? undefined,
      managerName: claim.manager?.name,
      managerNotes: claim.managerNotes ?? undefined,
      financeNotes: claim.financeNotes ?? undefined,
      rejectionReason: claim.rejectionReason ?? undefined,
      sendBackReason: claim.sendBackReason ?? undefined,
      paymentReference: claim.paymentReference ?? undefined,
      paymentMode: claim.paymentMode ?? undefined,
      lines: lines.map((l) => ({
        id: l.id,
        lineNo: l.lineNo,
        categoryId: l.categoryId,
        categoryName: l.category?.name,
        categoryCode: l.category?.code,
        expenseDate: this.toDateKey(l.expenseDate),
        merchant: l.merchant,
        description: l.description,
        amount: l.amount,
        receiptDocumentId: l.receiptDocumentId ?? undefined,
        hasReceipt: Boolean(l.receiptDocumentId),
        receiptFileName: l.receiptDocument?.fileName ?? undefined,
        receiptMimeType: l.receiptDocument?.mimeType ?? undefined,
        receiptSizeBytes: l.receiptDocument?.sizeBytes ?? undefined,
      })),
      timeline: audits.map((a) => ({
        action: a.action,
        fromStatus: a.fromStatus,
        toStatus: a.toStatus,
        actorEmployeeId: a.actorEmployeeId,
        createdAt: a.createdAt?.toISOString?.() ?? null,
        payload: a.payloadJson ?? undefined,
      })),
    };
  }

  private normalizeMoney(value: string): string {
    try {
      return normalizeMoneyAmount(value);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid amount',
      );
    }
  }

  private assertPositiveAmount(amount: string) {
    if (!(Number(amount) > 0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
  }

  private assertSupportedCurrency(currency: string) {
    if (
      !(SUPPORTED_CURRENCIES as readonly string[]).includes(currency) &&
      !/^[A-Z]{3}$/.test(currency)
    ) {
      throw new BadRequestException('Unsupported currency');
    }
  }

  private assertDateFormat(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date must be YYYY-MM-DD');
    }
  }

  private toDateKey(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private addDays(dateKey: string, days: number): string {
    const d = new Date(`${dateKey}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private csvEscape(value: string): string {
    return escapeCsvCell(value);
  }
}
