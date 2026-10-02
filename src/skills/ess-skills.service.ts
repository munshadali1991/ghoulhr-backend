import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { Skill } from './entities/skill.entity';
import { SkillCategory } from './entities/skill-category.entity';
import { SkillSubcategory } from './entities/skill-subcategory.entity';
import {
  CreateEmployeeSkillDto,
  UpdateEmployeeSkillDto,
} from './dto/employee-skill.dto';
import { SkillMasterService } from './skill-master.service';

@Injectable()
export class EssSkillsService {
  constructor(private readonly skillMasterService: SkillMasterService) {}

  private mapAssignment(row: EmployeeSkill) {
    return {
      id: row.id,
      skillId: row.skillId,
      skillName: row.skill?.name ?? null,
      skillIsActive: row.skill?.isActive ?? false,
      categoryId: row.skill?.categoryId ?? row.skill?.category?.id ?? null,
      categoryName: row.skill?.category?.name ?? null,
      subcategoryId: row.skill?.subcategoryId ?? row.skill?.subcategory?.id ?? null,
      subcategoryName: row.skill?.subcategory?.name ?? null,
      experienceMonths: row.experienceMonths,
      proficiency: row.proficiency,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  async getCatalog(dataSource: DataSource, organizationId: string) {
    await this.skillMasterService.ensureDefaultCatalog(dataSource, organizationId);

    const [categories, subcategories, skills] = await Promise.all([
      dataSource.getRepository(SkillCategory).find({
        where: { organizationId, isActive: true, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      dataSource.getRepository(SkillSubcategory).find({
        where: { organizationId, isActive: true, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
      dataSource.getRepository(Skill).find({
        where: { organizationId, isActive: true, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
    ]);

    const skillsBySubcategory = new Map<string, { id: string; name: string }[]>();
    for (const skill of skills) {
      const list = skillsBySubcategory.get(skill.subcategoryId) ?? [];
      list.push({ id: skill.id, name: skill.name });
      skillsBySubcategory.set(skill.subcategoryId, list);
    }

    const subcategoriesByCategory = new Map<
      string,
      { id: string; name: string; skills: { id: string; name: string }[] }[]
    >();
    for (const subcategory of subcategories) {
      const nestedSkills = skillsBySubcategory.get(subcategory.id) ?? [];
      if (nestedSkills.length === 0) continue;
      const list = subcategoriesByCategory.get(subcategory.categoryId) ?? [];
      list.push({
        id: subcategory.id,
        name: subcategory.name,
        skills: nestedSkills,
      });
      subcategoriesByCategory.set(subcategory.categoryId, list);
    }

    return {
      categories: categories
        .map((category) => ({
          id: category.id,
          name: category.name,
          subcategories: subcategoriesByCategory.get(category.id) ?? [],
        }))
        .filter((category) => category.subcategories.length > 0),
    };
  }

  async listMySkills(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const rows = await dataSource.getRepository(EmployeeSkill).find({
      where: { organizationId, employeeId, deletedAt: IsNull() },
      relations: ['skill', 'skill.category', 'skill.subcategory'],
      order: { createdAt: 'DESC' },
    });
    return { skills: rows.map((row) => this.mapAssignment(row)) };
  }

  private async loadAssignment(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    id: string,
  ): Promise<EmployeeSkill> {
    const row = await dataSource.getRepository(EmployeeSkill).findOne({
      where: { id, organizationId, employeeId, deletedAt: IsNull() },
      relations: ['skill', 'skill.category', 'skill.subcategory'],
    });
    if (!row) {
      throw new NotFoundException('Skill assignment not found.');
    }
    return row;
  }

  async addSkill(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    dto: CreateEmployeeSkillDto,
  ) {
    const skill = await dataSource.getRepository(Skill).findOne({
      where: { id: dto.skillId, organizationId, deletedAt: IsNull() },
      relations: ['category', 'subcategory'],
    });
    if (!skill || !skill.isActive) {
      throw new BadRequestException('Skill is not available to assign.');
    }

    const repo = dataSource.getRepository(EmployeeSkill);
    const duplicate = await repo.findOne({
      where: { employeeId, skillId: skill.id, deletedAt: IsNull() },
    });
    if (duplicate) {
      throw new BadRequestException('You have already added this skill.');
    }

    const row = await repo.save(
      repo.create({
        organizationId,
        employeeId,
        skillId: skill.id,
        experienceMonths: dto.experienceMonths,
        proficiency: dto.proficiency,
      }),
    );
    row.skill = skill;
    return this.mapAssignment(row);
  }

  async updateSkill(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    id: string,
    dto: UpdateEmployeeSkillDto,
  ) {
    const repo = dataSource.getRepository(EmployeeSkill);
    const row = await this.loadAssignment(
      dataSource,
      organizationId,
      employeeId,
      id,
    );
    row.experienceMonths = dto.experienceMonths;
    row.proficiency = dto.proficiency;
    const saved = await repo.save(row);
    saved.skill = row.skill;
    return this.mapAssignment(saved);
  }

  async removeSkill(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    id: string,
  ) {
    const repo = dataSource.getRepository(EmployeeSkill);
    const row = await this.loadAssignment(
      dataSource,
      organizationId,
      employeeId,
      id,
    );
    await repo.softRemove(row);
    return { id };
  }
}
