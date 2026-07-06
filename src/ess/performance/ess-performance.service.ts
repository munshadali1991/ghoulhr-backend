import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Employee } from '../../employees/employee.entity';
import { Department } from '../../employees/entities/department.entity';
import { EmployeeEmploymentDetail } from '../../employees/entities/employee-employment-detail.entity';
import { EmployeeReportingManager } from '../../employees/entities/employee-reporting-manager.entity';
import { AuthorizationService } from '../../rbac/authorization.service';
import { EmployeeScopeService } from '../../rbac/employee-scope.service';
import {
  PerformanceAssessment,
  PerformanceAssessmentStatus,
} from '../entities/performance-assessment.entity';
import {
  PerformanceAnswer,
  PerformanceAnswerRole,
} from '../entities/performance-answer.entity';
import { SaveAssessmentDraftDto } from './dto/save-assessment-draft.dto';
import { ReviewAssessmentDto } from './dto/review-assessment.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { ListReviewAssessmentsQueryDto } from './dto/list-review-assessments-query.dto';
import { PerformanceAnswerDto } from './dto/performance-answer.dto';
import {
  computeAssessmentScore,
  PERFORMANCE_DEFAULT_TEMPLATE_KEY,
} from './performance.constants';
import { PerformanceMasterService } from './performance-master.service';
import type { PerformanceAssessmentSchema } from './performance-schema.types';
import { resolveViewerCapabilities, normalizeSectionRoleCode } from './assessment-workflow.util';

@Injectable()
export class EssPerformanceService {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
    private readonly performanceMasterService: PerformanceMasterService,
  ) {}

  /** Assessments assigned to the current employee. */
  async listMyAssessments(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const rows = await dataSource
      .getRepository(PerformanceAssessment)
      .find({
        where: { organizationId, employeeId },
        order: { createdAt: 'DESC' },
      });

    return rows.map((row) => this.toSummary(row));
  }

  /** Manager (team) or HR (org) scoped assessment list for review workflows. */
  async listReviewAssessments(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    query: ListReviewAssessmentsQueryDto,
  ) {
    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const listPermission = auth.permissions.includes('performance.hr:read')
      ? 'performance.hr:read'
      : auth.permissions.includes('performance.review:read')
        ? 'performance.review:read'
        : null;

    if (!listPermission) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      listPermission,
      auth,
    );

    if (visibleIds !== null && visibleIds.length === 0) {
      return { assessments: [] };
    }

    const qb = dataSource
      .getRepository(PerformanceAssessment)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .where('a.organizationId = :organizationId', { organizationId })
      .orderBy('a.updatedAt', 'DESC');

    if (visibleIds !== null) {
      qb.andWhere('a.employeeId IN (:...visibleIds)', { visibleIds });
    }

    if (query.status) {
      qb.andWhere('a.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        '(a.cycleLabel ILIKE :term OR employee.name ILIKE :term OR employee.employeeCode ILIKE :term)',
        { term: `%${search}%` },
      );
    }

    const rows = await qb.getMany();

    return {
      assessments: rows.map((row) => ({
        ...this.toSummary(row),
        employeeId: row.employeeId,
        employeeName: row.employee?.name ?? null,
        employeeCode: row.employee?.employeeCode ?? null,
      })),
    };
  }

  /** Full assessment with answers + header context (self / manager / HR access). */
  async getAssessment(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    id: string,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    await this.assertCanView(
      dataSource,
      organizationId,
      actorEmployeeId,
      assessment,
    );

    const answers = await dataSource
      .getRepository(PerformanceAnswer)
      .find({ where: { assessmentId: id } });

    const schema = await this.ensureAssessmentSchema(
      dataSource,
      organizationId,
      assessment,
    );

    const header = await this.buildHeaderContext(
      dataSource,
      organizationId,
      assessment,
    );

    const isOwner = assessment.employeeId === actorEmployeeId;
    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const sectionRoleCodes = (schema.sections ?? []).map((s) => s.role);
    const capabilities = resolveViewerCapabilities({
      isOwner,
      actorRoleCodes: auth.roleCodes,
      status: assessment.status,
      sectionRoleCodes,
    });

    return {
      ...this.toSummary(assessment),
      description: assessment.description ?? null,
      dueDate: assessment.dueDate ?? null,
      schema,
      header,
      answers: answers.map((a) => this.toAnswerDto(a)),
      viewer: {
        isOwner,
        roleCodes: auth.roleCodes,
        actingRole: capabilities.actingRole,
        editableEmployee: capabilities.editableEmployee,
        editableManager: capabilities.editableManager,
        editableHr: capabilities.editableHr,
        editableByRole: capabilities.editableByRole,
      },
    };
  }

  /** Employee saves self-assessment answers (Q1-40) as a draft. */
  async saveDraft(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    id: string,
    dto: SaveAssessmentDraftDto,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    if (assessment.employeeId !== employeeId) {
      throw new ForbiddenException('You can only edit your own assessment.');
    }
    if (
      assessment.status !== PerformanceAssessmentStatus.DRAFT &&
      assessment.status !== PerformanceAssessmentStatus.SUBMITTED
    ) {
      throw new ForbiddenException(
        'This assessment can no longer be edited by the employee.',
      );
    }

    await dataSource.transaction(async (manager) => {
      await this.upsertAnswers(
        manager,
        id,
        dto.answers,
        PerformanceAnswerRole.EMPLOYEE,
      );
      await this.recomputeScore(manager, id);
    });

    return this.getAssessment(dataSource, organizationId, employeeId, id);
  }

  /** Employee submits the self-assessment (DRAFT -> SUBMITTED). */
  async submitAssessment(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    id: string,
    dto: SaveAssessmentDraftDto,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    if (assessment.employeeId !== employeeId) {
      throw new ForbiddenException('You can only submit your own assessment.');
    }
    if (
      assessment.status !== PerformanceAssessmentStatus.DRAFT &&
      assessment.status !== PerformanceAssessmentStatus.SUBMITTED
    ) {
      throw new ForbiddenException('This assessment has already progressed.');
    }

    await dataSource.transaction(async (manager) => {
      if (dto.answers?.length) {
        await this.upsertAnswers(
          manager,
          id,
          dto.answers,
          PerformanceAnswerRole.EMPLOYEE,
        );
      }
      const score = await this.recomputeScore(manager, id);
      await manager.getRepository(PerformanceAssessment).update(id, {
        status: PerformanceAssessmentStatus.SUBMITTED,
        submittedAt: new Date(),
        score: String(score),
      });
    });

    return this.getAssessment(dataSource, organizationId, employeeId, id);
  }

  /** Manager fills the manager-review section (Q42/43), TEAM-scoped. */
  async saveManagerReview(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    id: string,
    dto: ReviewAssessmentDto,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    await this.assertScopedAct(
      dataSource,
      organizationId,
      actorEmployeeId,
      assessment,
      'performance.review:act',
    );

    if (assessment.status !== PerformanceAssessmentStatus.SUBMITTED) {
      throw new ForbiddenException(
        'Manager review is only available after the employee submits their assessment.',
      );
    }

    await dataSource.transaction(async (manager) => {
      await this.upsertAnswers(
        manager,
        id,
        dto.answers,
        PerformanceAnswerRole.MANAGER,
      );
      const patch: Partial<PerformanceAssessment> = {
        managerReviewedAt: new Date(),
      };
      if (dto.complete !== false) {
        patch.status = PerformanceAssessmentStatus.MANAGER_REVIEWED;
      }
      await manager.getRepository(PerformanceAssessment).update(id, patch);
    });

    return this.getAssessment(dataSource, organizationId, actorEmployeeId, id);
  }

  /** HR fills the HR-review section (Q49), ORGANIZATION-scoped. */
  async saveHrReview(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    id: string,
    dto: ReviewAssessmentDto,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    await this.assertScopedAct(
      dataSource,
      organizationId,
      actorEmployeeId,
      assessment,
      'performance.hr:act',
    );

    if (assessment.status !== PerformanceAssessmentStatus.MANAGER_REVIEWED) {
      throw new ForbiddenException(
        'HR feedback is only available after manager review is complete.',
      );
    }

    await dataSource.transaction(async (manager) => {
      await this.upsertAnswers(
        manager,
        id,
        dto.answers,
        'HR_ADMIN',
      );
      const patch: Partial<PerformanceAssessment> = {
        hrReviewedAt: new Date(),
      };
      if (dto.complete !== false) {
        patch.status = PerformanceAssessmentStatus.COMPLETED;
      }
      await manager.getRepository(PerformanceAssessment).update(id, patch);
    });

    return this.getAssessment(dataSource, organizationId, actorEmployeeId, id);
  }

  /** Custom RBAC role sections (non system workflow roles). */
  async saveRoleReview(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    id: string,
    roleCode: string,
    dto: ReviewAssessmentDto,
  ) {
    const assessment = await this.loadAssessment(dataSource, organizationId, id);

    await this.assertCanView(
      dataSource,
      organizationId,
      actorEmployeeId,
      assessment,
    );

    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });

    const normalizedRole = normalizeSectionRoleCode(roleCode);
    if (!auth.roleCodes.includes(normalizedRole)) {
      throw new ForbiddenException('You do not have the required role for this section.');
    }

    const schema = await this.ensureAssessmentSchema(
      dataSource,
      organizationId,
      assessment,
    );

    const capabilities = resolveViewerCapabilities({
      isOwner: assessment.employeeId === actorEmployeeId,
      actorRoleCodes: auth.roleCodes,
      status: assessment.status,
      sectionRoleCodes: (schema.sections ?? []).map((s) => s.role),
    });

    if (capabilities.actingRole !== normalizedRole) {
      throw new ForbiddenException(
        'This section cannot be edited at the current workflow stage.',
      );
    }

    await dataSource.transaction(async (manager) => {
      await this.upsertAnswers(manager, id, dto.answers, normalizedRole);
    });

    return this.getAssessment(dataSource, organizationId, actorEmployeeId, id);
  }

  /** HR assigns a new assessment cycle to an employee. */
  async createAssessment(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateAssessmentDto,
  ) {
    const employee = await dataSource
      .getRepository(Employee)
      .findOne({ where: { id: dto.employeeId, organizationId } });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const templateKey = dto.templateKey || PERFORMANCE_DEFAULT_TEMPLATE_KEY;

    const repo = dataSource.getRepository(PerformanceAssessment);
    const existing = await repo.findOne({
      where: {
        organizationId,
        employeeId: dto.employeeId,
        templateKey,
        cycleLabel: dto.cycleLabel,
      },
    });
    if (existing) {
      return this.toSummary(existing);
    }

    const alignManagerId =
      dto.alignManagerEmployeeId ??
      (await this.resolvePrimaryManagerId(dataSource, dto.employeeId));

    const schema = await this.performanceMasterService.buildSnapshot(
      dataSource,
      organizationId,
    );

    if (
      !schema.sections.length ||
      !schema.sections.some((s) => s.questions.length > 0)
    ) {
      throw new BadRequestException(
        'Configure at least one section with questions in Settings → Performance before assigning assessments.',
      );
    }

    const created = await repo.save(
      repo.create({
        organizationId,
        employeeId: dto.employeeId,
        templateKey,
        cycleLabel: dto.cycleLabel,
        description: dto.description ?? null,
        dueDate: dto.dueDate ?? null,
        status: PerformanceAssessmentStatus.DRAFT,
        score: '0',
        alignManagerEmployeeId: alignManagerId,
        schema,
      }),
    );

    return this.toSummary(created);
  }

  // --- helpers -------------------------------------------------------------

  private async loadAssessment(
    dataSource: DataSource,
    organizationId: string,
    id: string,
  ): Promise<PerformanceAssessment> {
    const assessment = await dataSource
      .getRepository(PerformanceAssessment)
      .findOne({ where: { id, organizationId } });
    if (!assessment) {
      throw new NotFoundException('Assessment not found.');
    }
    return assessment;
  }

  private async assertCanView(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    assessment: PerformanceAssessment,
  ): Promise<void> {
    if (assessment.employeeId === actorEmployeeId) {
      return;
    }

    // Managers (TEAM) / HR (ORGANIZATION) may view via their review permission.
    for (const permission of ['performance.review:read', 'performance.hr:read']) {
      const auth = await this.authorizationService.resolve({
        employeeId: actorEmployeeId,
        organizationId,
        tenantDataSource: dataSource,
      });
      if (!auth.permissions.includes(permission)) {
        continue;
      }
      const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
        dataSource,
        actorEmployeeId,
        permission,
        auth,
      );
      if (!visibleIds || visibleIds.includes(assessment.employeeId)) {
        return;
      }
    }

    throw new ForbiddenException('You cannot view this assessment.');
  }

  private async assertScopedAct(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    assessment: PerformanceAssessment,
    permission: string,
  ): Promise<void> {
    const auth = await this.authorizationService.resolve({
      employeeId: actorEmployeeId,
      organizationId,
      tenantDataSource: dataSource,
    });
    if (!auth.permissions.includes(permission)) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      dataSource,
      actorEmployeeId,
      permission,
      auth,
    );
    if (visibleIds && !visibleIds.includes(assessment.employeeId)) {
      throw new ForbiddenException(
        'This assessment is outside your review scope.',
      );
    }
  }

  private async upsertAnswers(
    manager: EntityManager,
    assessmentId: string,
    answers: PerformanceAnswerDto[],
    role: string,
  ): Promise<void> {
    if (!answers?.length) {
      return;
    }

    const repo = manager.getRepository(PerformanceAnswer);
    const keys = answers.map((a) => a.questionKey);
    const existing = keys.length
      ? await repo.find({ where: { assessmentId, questionKey: In(keys) } })
      : [];
    const existingByKey = new Map(existing.map((e) => [e.questionKey, e]));

    const toSave: PerformanceAnswer[] = answers.map((incoming) => {
      const row = existingByKey.get(incoming.questionKey) ?? repo.create({
        assessmentId,
        questionKey: incoming.questionKey,
      });
      row.section = incoming.section ?? row.section ?? null;
      row.answerType = incoming.answerType ?? row.answerType ?? null;
      row.valueText = incoming.valueText ?? null;
      row.valueRating = incoming.valueRating ?? null;
      row.valueNumber =
        incoming.valueNumber != null ? String(incoming.valueNumber) : null;
      row.comment = incoming.comment ?? null;
      row.filledByRole = role;
      return row;
    });

    await repo.save(toSave);
  }

  private async recomputeScore(
    manager: EntityManager,
    assessmentId: string,
  ): Promise<number> {
    const assessment = await manager
      .getRepository(PerformanceAssessment)
      .findOne({ where: { id: assessmentId } });
    const answers = await manager
      .getRepository(PerformanceAnswer)
      .find({ where: { assessmentId } });
    const score = computeAssessmentScore(answers, assessment?.schema);
    await manager
      .getRepository(PerformanceAssessment)
      .update(assessmentId, { score: String(score) });
    return score;
  }

  private async ensureAssessmentSchema(
    dataSource: DataSource,
    organizationId: string,
    assessment: PerformanceAssessment,
  ): Promise<PerformanceAssessmentSchema> {
    if (assessment.schema) {
      return assessment.schema;
    }

    const schema = await this.performanceMasterService.buildSnapshot(
      dataSource,
      organizationId,
    );

    await dataSource.getRepository(PerformanceAssessment).update(assessment.id, {
      schema,
    });
    assessment.schema = schema;
    return schema;
  }

  private async resolvePrimaryManagerId(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<string | null> {
    const row = await dataSource
      .getRepository(EmployeeReportingManager)
      .createQueryBuilder('rm')
      .where('rm.employeeId = :employeeId', { employeeId })
      .andWhere('(rm.effectiveTo IS NULL OR rm.effectiveTo >= CURRENT_DATE)')
      .andWhere('(rm.effectiveFrom IS NULL OR rm.effectiveFrom <= CURRENT_DATE)')
      .orderBy('rm.managerType', 'ASC')
      .getOne();
    return row?.managerEmployeeId ?? null;
  }

  private async buildHeaderContext(
    dataSource: DataSource,
    organizationId: string,
    assessment: PerformanceAssessment,
  ) {
    const employee = await dataSource
      .getRepository(Employee)
      .findOne({
        where: { id: assessment.employeeId, organizationId },
        relations: ['departmentRef'],
      });

    const employment = await dataSource
      .getRepository(EmployeeEmploymentDetail)
      .createQueryBuilder('d')
      .where('d.employeeId = :employeeId', {
        employeeId: assessment.employeeId,
      })
      .getOne()
      .catch(() => null);

    const managerId =
      assessment.alignManagerEmployeeId ??
      (await this.resolvePrimaryManagerId(dataSource, assessment.employeeId));

    let alignManager: Employee | null = null;
    if (managerId) {
      alignManager = await dataSource
        .getRepository(Employee)
        .findOne({ where: { id: managerId } });
    }

    return {
      employeeName: employee?.name ?? null,
      employeeCode: employee?.employeeCode ?? null,
      dateOfBirth: employee?.dateOfBirth ?? null,
      dateOfJoining: employee?.dateOfJoining ?? null,
      location: employment?.workLocation ?? null,
      department: (employee as Employee & { departmentRef?: Department })
        ?.departmentRef?.name ?? null,
      alignManagerName: alignManager?.name ?? null,
      alignManagerCode: alignManager?.employeeCode ?? null,
    };
  }

  private toSummary(row: PerformanceAssessment) {
    return {
      id: row.id,
      templateKey: row.templateKey,
      cycleLabel: row.cycleLabel,
      status: row.status,
      score: Number(row.score),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      managerReviewedAt: row.managerReviewedAt?.toISOString() ?? null,
      hrReviewedAt: row.hrReviewedAt?.toISOString() ?? null,
      dueDate: row.dueDate ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  private toAnswerDto(row: PerformanceAnswer) {
    return {
      questionKey: row.questionKey,
      section: row.section ?? null,
      answerType: row.answerType ?? null,
      valueText: row.valueText ?? null,
      valueRating: row.valueRating ?? null,
      valueNumber: row.valueNumber != null ? Number(row.valueNumber) : null,
      comment: row.comment ?? null,
      filledByRole: row.filledByRole,
    };
  }
}
