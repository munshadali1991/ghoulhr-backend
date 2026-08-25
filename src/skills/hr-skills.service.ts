import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, ILike, IsNull } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EmployeeEmploymentDetail } from '../employees/entities/employee-employment-detail.entity';
import {
  EmployeeReportingManager,
  REPORTING_MANAGER_TYPE_PRIMARY,
} from '../employees/entities/employee-reporting-manager.entity';
import { StorageService } from '../storage/storage.service';
import { EssSkillsService } from './ess-skills.service';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { SkillProficiency } from './enums/skill-proficiency.enum';
import type { SearchHrSkillsQueryDto } from './dto/hr-skills-search.dto';

const SEARCH_LIMIT = 50;

const PROFICIENCY_RANK: Record<string, number> = {
  [SkillProficiency.EXPERT]: 3,
  [SkillProficiency.GOOD]: 2,
  [SkillProficiency.BEGINNER]: 1,
};

export type HrSkillSearchFilters = SearchHrSkillsQueryDto;

@Injectable()
export class HrSkillsService {
  private readonly logger = new Logger(HrSkillsService.name);

  constructor(
    private readonly essSkillsService: EssSkillsService,
    private readonly storageService: StorageService,
  ) {}

  getCatalog(dataSource: DataSource, organizationId: string) {
    return this.essSkillsService.getCatalog(dataSource, organizationId);
  }

  async searchEmployees(
    dataSource: DataSource,
    organizationId: string,
    visibleEmployeeIds: string[] | null,
    query: HrSkillSearchFilters,
  ) {
    if (Array.isArray(visibleEmployeeIds) && visibleEmployeeIds.length === 0) {
      return { employees: [] };
    }

    const empRepo = dataSource.getRepository(Employee);
    const q = query.q?.trim();
    const whereBase = { organizationId, deletedAt: IsNull() };
    const nameWhere = q
      ? [
          { ...whereBase, name: ILike(`%${q}%`) },
          { ...whereBase, employeeCode: ILike(`%${q}%`) },
        ]
      : whereBase;

    let employees = await empRepo.find({
      where: nameWhere,
      relations: ['departmentRef', 'designationRef'],
      order: { name: 'ASC' },
    });

    if (visibleEmployeeIds) {
      const allowed = new Set(visibleEmployeeIds);
      employees = employees.filter((row) => allowed.has(row.id));
    }

    const assignments = await dataSource.getRepository(EmployeeSkill).find({
      where: { organizationId, deletedAt: IsNull() },
      relations: ['skill'],
    });

    const hasSkillFilter = Boolean(
      query.categoryId ||
        query.subcategoryId ||
        query.skillId ||
        query.proficiency ||
        query.minExperienceMonths != null,
    );

    if (hasSkillFilter) {
      const matchingIds = new Set(
        assignments
          .filter((row) => this.assignmentMatchesFilters(row, query))
          .map((row) => row.employeeId),
      );
      employees = employees.filter((row) => matchingIds.has(row.id));
    }

    const page = employees.slice(0, SEARCH_LIMIT);
    const byEmployee = new Map<string, EmployeeSkill[]>();
    for (const row of assignments) {
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push(row);
      byEmployee.set(row.employeeId, list);
    }

    const cards = await Promise.all(
      page.map(async (employee) => ({
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        profilePhotoPreviewUrl: await this.resolvePhoto(employee),
        designationName: employee.designationRef?.name ?? null,
        departmentName: employee.departmentRef?.name ?? null,
        topSkills: this.topSkills(byEmployee.get(employee.id) ?? []),
      })),
    );

    return { employees: cards };
  }

  async getEmployeeProfile(
    dataSource: DataSource,
    organizationId: string,
    visibleEmployeeIds: string[] | null,
    employeeId: string,
  ) {
    if (Array.isArray(visibleEmployeeIds) && !visibleEmployeeIds.includes(employeeId)) {
      throw new NotFoundException('Employee not found.');
    }

    const employee = await dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, organizationId, deletedAt: IsNull() },
      relations: ['departmentRef', 'designationRef'],
    });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const [assignments, employment, managerLink] = await Promise.all([
      dataSource.getRepository(EmployeeSkill).find({
        where: { organizationId, employeeId, deletedAt: IsNull() },
        relations: ['skill', 'skill.category', 'skill.subcategory'],
      }),
      dataSource.getRepository(EmployeeEmploymentDetail).findOne({
        where: { employee: { id: employeeId }, deletedAt: IsNull() },
      }),
      dataSource.getRepository(EmployeeReportingManager).findOne({
        where: {
          employeeId,
          managerType: REPORTING_MANAGER_TYPE_PRIMARY,
          effectiveTo: IsNull(),
          deletedAt: IsNull(),
        },
        relations: ['manager'],
      }),
    ]);

    const lastSkillUpdate = assignments.reduce<Date | null>((latest, row) => {
      const at = row.updatedAt instanceof Date ? row.updatedAt : row.updatedAt ? new Date(row.updatedAt) : null;
      if (!at || Number.isNaN(at.getTime())) return latest;
      if (!latest || at > latest) return at;
      return latest;
    }, null);

    const employeeUpdated =
      employee.updatedAt instanceof Date
        ? employee.updatedAt
        : employee.updatedAt
          ? new Date(employee.updatedAt)
          : null;

    const lastProfileUpdate = lastSkillUpdate ?? employeeUpdated;

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      profilePhotoPreviewUrl: await this.resolvePhoto(employee),
      designationName: employee.designationRef?.name ?? null,
      departmentName: employee.departmentRef?.name ?? null,
      managerName: managerLink?.manager?.name ?? null,
      totalExperienceYears: employment?.totalExperienceYears ?? null,
      lastProfileUpdate: lastProfileUpdate?.toISOString?.() ?? lastProfileUpdate,
      counts: {
        total: assignments.length,
        expert: assignments.filter((row) => row.proficiency === SkillProficiency.EXPERT).length,
        good: assignments.filter((row) => row.proficiency === SkillProficiency.GOOD).length,
        beginner: assignments.filter((row) => row.proficiency === SkillProficiency.BEGINNER).length,
      },
      groups: this.groupAssignments(assignments),
    };
  }

  private assignmentMatchesFilters(row: EmployeeSkill, query: HrSkillSearchFilters) {
    if (query.skillId && row.skillId !== query.skillId) return false;
    if (query.categoryId && row.skill?.categoryId !== query.categoryId) return false;
    if (query.subcategoryId && row.skill?.subcategoryId !== query.subcategoryId) {
      return false;
    }
    if (query.proficiency && row.proficiency !== query.proficiency) return false;
    if (
      query.minExperienceMonths != null &&
      Number(row.experienceMonths) < Number(query.minExperienceMonths)
    ) {
      return false;
    }
    return true;
  }

  private topSkills(rows: EmployeeSkill[]) {
    return [...rows]
      .sort((a, b) => {
        const rank =
          (PROFICIENCY_RANK[b.proficiency] ?? 0) - (PROFICIENCY_RANK[a.proficiency] ?? 0);
        if (rank !== 0) return rank;
        return Number(b.experienceMonths) - Number(a.experienceMonths);
      })
      .slice(0, 3)
      .map((row) => ({
        skillId: row.skillId,
        skillName: row.skill?.name ?? null,
        proficiency: row.proficiency,
        experienceMonths: row.experienceMonths,
      }));
  }

  private groupAssignments(rows: EmployeeSkill[]) {
    const categories = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        subcategories: Map<
          string,
          {
            subcategoryId: string;
            subcategoryName: string;
            skills: {
              skillId: string;
              skillName: string;
              experienceMonths: number;
              proficiency: SkillProficiency;
            }[];
          }
        >;
      }
    >();

    for (const row of rows) {
      const categoryId = row.skill?.categoryId ?? row.skill?.category?.id ?? 'unknown';
      const categoryName = row.skill?.category?.name ?? 'Uncategorized';
      const subcategoryId =
        row.skill?.subcategoryId ?? row.skill?.subcategory?.id ?? 'unknown';
      const subcategoryName = row.skill?.subcategory?.name ?? 'Uncategorized';

      if (!categories.has(categoryId)) {
        categories.set(categoryId, {
          categoryId,
          categoryName,
          subcategories: new Map(),
        });
      }
      const category = categories.get(categoryId)!;
      if (!category.subcategories.has(subcategoryId)) {
        category.subcategories.set(subcategoryId, {
          subcategoryId,
          subcategoryName,
          skills: [],
        });
      }
      category.subcategories.get(subcategoryId)!.skills.push({
        skillId: row.skillId,
        skillName: row.skill?.name ?? 'Skill',
        experienceMonths: row.experienceMonths,
        proficiency: row.proficiency,
      });
    }

    return [...categories.values()].map((category) => ({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      subcategories: [...category.subcategories.values()],
    }));
  }

  private async resolvePhoto(employee: Employee): Promise<string | null> {
    const key = employee.profilePhotoStorageKey?.trim();
    if (key && employee.organizationId) {
      try {
        return await this.storageService.getAssetPreviewUrl(
          employee.organizationId,
          key,
          'image/jpeg',
        );
      } catch (err) {
        this.logger.warn(`Profile photo preview failed: ${(err as Error).message}`);
      }
    }
    const legacy = employee.profilePhotoUrl?.trim();
    if (
      legacy &&
      (legacy.startsWith('http://') ||
        legacy.startsWith('https://') ||
        legacy.startsWith('data:'))
    ) {
      return legacy;
    }
    return null;
  }
}
