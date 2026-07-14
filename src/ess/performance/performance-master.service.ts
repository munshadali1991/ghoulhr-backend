import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { RbacRole } from '../../rbac/entities/rbac-role.entity';
import { PerformanceSection } from '../entities/performance-section.entity';
import { PerformanceQuestion } from '../entities/performance-question.entity';
import { PerformanceRatingOption } from '../entities/performance-rating-option.entity';
import { UpdatePerformanceMasterDto } from './dto/update-performance-master.dto';
import type {
  PerformanceAssessmentSchema,
  PerformanceMasterPayload,
} from './performance-schema.types';

@Injectable()
export class PerformanceMasterService {
  /** Load org performance master (empty when not yet configured). */
  async getMaster(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<PerformanceMasterPayload> {
    return this.loadMasterPayload(dataSource, organizationId);
  }

  /** Build an immutable snapshot for a new or legacy assessment. */
  async buildSnapshot(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<PerformanceAssessmentSchema> {
    const master = await this.getMaster(dataSource, organizationId);
    const snapshot = this.toSnapshot(master);
    const roleNames = await this.loadRoleNameMap(dataSource);

    return {
      ...snapshot,
      sections: snapshot.sections.map((section) => ({
        ...section,
        filledByRoleName: roleNames.get(section.role) ?? section.role,
      })),
    };
  }

  /** Transactional bulk-replace of the org performance master. */
  async replaceMaster(
    dataSource: DataSource,
    organizationId: string,
    dto: UpdatePerformanceMasterDto,
  ): Promise<PerformanceMasterPayload> {
    if (!dto.sections.length) {
      throw new BadRequestException('At least one section is required.');
    }

    const needsRating = dto.sections.some((section) =>
      section.questions.some(
        (q) => q.type === 'rating' && q.isActive !== false,
      ),
    );
    if (needsRating && !dto.ratingOptions.length) {
      throw new BadRequestException(
        'At least one rating option is required when using rating questions.',
      );
    }

    await this.validateSectionRoles(dataSource, dto);

    await dataSource.transaction(async (em) => {
      await this.syncRatingOptions(em, organizationId, dto.ratingOptions);
      await this.syncSections(em, organizationId, dto.sections);
    });

    return this.loadMasterPayload(dataSource, organizationId);
  }

  /** Whether the org has a publishable template for assignment. */
  async hasAssignableTemplate(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<boolean> {
    const master = await this.getMaster(dataSource, organizationId);
    const snapshot = this.toSnapshot(master);
    return snapshot.sections.some((s) => s.questions.length > 0);
  }

  toSnapshot(master: PerformanceMasterPayload): PerformanceAssessmentSchema {
    const activeRatingLabels = master.ratingOptions
      .filter((o) => o.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((o) => o.label);

    let number = 1;
    const sections = master.sections
      .filter((s) => s.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((section) => ({
        key: section.key,
        title: section.title,
        banner: section.banner ?? null,
        role: section.role,
        scored: section.scored,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        questions: section.questions
          .filter((q) => q.isActive !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((question) => {
            const normalizedType =
              question.type === 'narrative' ? 'textarea' : question.type;
            const snapshot = {
              key: question.key,
              number: number++,
              label: question.label,
              type: normalizedType,
              allowComment: question.allowComment ?? false,
              required: question.required ?? true,
              helperText: question.helperText ?? null,
              placeholder: question.placeholder ?? null,
              sortOrder: question.sortOrder,
              isActive: question.isActive,
              options:
                normalizedType === 'rating'
                  ? activeRatingLabels
                  : normalizedType === 'select' || normalizedType === 'radio'
                    ? question.options ?? undefined
                    : question.options ?? undefined,
            };
            return snapshot;
          }),
      }));

    return {
      sections,
      ratingOptions: master.ratingOptions
        .filter((o) => o.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((o) => ({
          label: o.label,
          weight: o.weight,
          sortOrder: o.sortOrder,
          isActive: o.isActive,
        })),
    };
  }

  private async loadRoleNameMap(
    dataSource: DataSource,
  ): Promise<Map<string, string>> {
    const roles = await dataSource.getRepository(RbacRole).find({
      where: { isActive: true },
    });
    return new Map(roles.map((r) => [r.code, r.name]));
  }

  private async validateSectionRoles(
    dataSource: DataSource,
    dto: UpdatePerformanceMasterDto,
  ): Promise<void> {
    const roles = await dataSource.getRepository(RbacRole).find({
      where: { isActive: true },
    });
    const validCodes = new Set(roles.map((r) => r.code));

    dto.sections.forEach((section, index) => {
      const role = section.role?.trim();
      if (!role) {
        throw new BadRequestException(
          `Section ${index + 1} requires a Filled by role.`,
        );
      }
      if (!validCodes.has(role)) {
        throw new BadRequestException(
          `Section ${index + 1} references unknown role "${role}".`,
        );
      }
    });
  }

  private async loadMasterPayload(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<PerformanceMasterPayload> {
    const sections = await dataSource.getRepository(PerformanceSection).find({
      where: { organizationId },
      order: { sortOrder: 'ASC' },
    });

    const sectionIds = sections.map((s) => s.id);
    const questions = sectionIds.length
      ? await dataSource.getRepository(PerformanceQuestion).find({
          where: { sectionId: In(sectionIds) },
          order: { sortOrder: 'ASC' },
        })
      : [];

    const questionsBySection = new Map<string, PerformanceQuestion[]>();
    for (const question of questions) {
      const list = questionsBySection.get(question.sectionId) ?? [];
      list.push(question);
      questionsBySection.set(question.sectionId, list);
    }

    const ratingOptions = await dataSource
      .getRepository(PerformanceRatingOption)
      .find({
        where: { organizationId },
        order: { sortOrder: 'ASC' },
      });

    return {
      sections: sections.map((section) => ({
        id: section.id,
        key: section.key,
        title: section.title,
        banner: section.banner ?? null,
        role: section.role,
        scored: section.scored,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
        questions: (questionsBySection.get(section.id) ?? []).map((q) => ({
          id: q.id,
          key: q.key,
          label: q.label,
          type: q.type === 'narrative' ? 'textarea' : q.type,
          options: q.options ?? undefined,
          allowComment: q.allowComment,
          required: q.required,
          helperText: q.helperText ?? null,
          placeholder: q.placeholder ?? null,
          sortOrder: q.sortOrder,
          isActive: q.isActive,
        })),
      })),
      ratingOptions: ratingOptions.map((o) => ({
        id: o.id,
        label: o.label,
        weight: o.weight,
        sortOrder: o.sortOrder,
        isActive: o.isActive,
      })),
    };
  }

  private async syncRatingOptions(
    em: EntityManager,
    organizationId: string,
    incoming: UpdatePerformanceMasterDto['ratingOptions'],
  ): Promise<void> {
    const repo = em.getRepository(PerformanceRatingOption);
    const existing = await repo.find({ where: { organizationId } });
    const incomingIds = new Set(
      incoming.map((o) => o.id).filter((id): id is string => Boolean(id)),
    );

    for (const row of existing) {
      if (!incomingIds.has(row.id)) {
        await repo.remove(row);
      }
    }

    let order = 0;
    for (const item of incoming) {
      await repo.save(
        repo.create({
          id: item.id,
          organizationId,
          label: item.label.trim(),
          weight: item.weight,
          sortOrder: order,
          isActive: item.isActive ?? true,
        }),
      );
      order += 1;
    }
  }

  private async syncSections(
    em: EntityManager,
    organizationId: string,
    incoming: UpdatePerformanceMasterDto['sections'],
  ): Promise<void> {
    const sectionRepo = em.getRepository(PerformanceSection);
    const questionRepo = em.getRepository(PerformanceQuestion);

    const existingSections = await sectionRepo.find({ where: { organizationId } });
    const incomingSectionIds = new Set(
      incoming.map((s) => s.id).filter((id): id is string => Boolean(id)),
    );

    for (const row of existingSections) {
      if (!incomingSectionIds.has(row.id)) {
        await sectionRepo.remove(row);
      }
    }

    let sectionOrder = 0;
    for (const sectionItem of incoming) {
      const section = await sectionRepo.save(
        sectionRepo.create({
          id: sectionItem.id,
          organizationId,
          key: sectionItem.key.trim(),
          title: sectionItem.title.trim(),
          banner: sectionItem.banner?.trim() || null,
          role: sectionItem.role.trim(),
          scored: sectionItem.scored,
          sortOrder: sectionOrder,
          isActive: sectionItem.isActive ?? true,
        }),
      );
      sectionOrder += 1;

      const existingQuestions = await questionRepo.find({
        where: { sectionId: section.id },
      });
      const incomingQuestionIds = new Set(
        sectionItem.questions
          .map((q) => q.id)
          .filter((id): id is string => Boolean(id)),
      );

      for (const row of existingQuestions) {
        if (!incomingQuestionIds.has(row.id)) {
          await questionRepo.remove(row);
        }
      }

      let questionOrder = 0;
      for (const questionItem of sectionItem.questions) {
        const type =
          questionItem.type === 'narrative' ? 'textarea' : questionItem.type;
        await questionRepo.save(
          questionRepo.create({
            id: questionItem.id,
            organizationId,
            sectionId: section.id,
            key: questionItem.key.trim(),
            label: questionItem.label.trim(),
            type,
            options:
              type === 'select' || type === 'radio'
                ? questionItem.options ?? null
                : null,
            allowComment: questionItem.allowComment ?? false,
            required: questionItem.required ?? true,
            helperText: questionItem.helperText?.trim() || null,
            placeholder: questionItem.placeholder?.trim() || null,
            sortOrder: questionOrder,
            isActive: questionItem.isActive ?? true,
          }),
        );
        questionOrder += 1;
      }
    }
  }
}
