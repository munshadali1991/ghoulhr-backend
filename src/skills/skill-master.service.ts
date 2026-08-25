import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, FindOptionsWhere, IsNull, ObjectLiteral, Repository } from 'typeorm';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { SkillCategory } from './entities/skill-category.entity';
import { SkillSubcategory } from './entities/skill-subcategory.entity';
import { Skill } from './entities/skill.entity';
import {
  CreateSkillCategoryDto,
  CreateSkillDto,
  CreateSkillSubcategoryDto,
  ListSkillSubcategoriesQueryDto,
  ListSkillsQueryDto,
  UpdateSkillCategoryDto,
  UpdateSkillDto,
  UpdateSkillSubcategoryDto,
} from './dto/skill-master.dto';
import { DEFAULT_SKILL_CATALOG } from './skill-master.defaults';

type NamedMaster = ObjectLiteral & {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class SkillMasterService {
  async ensureDefaultCatalog(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<void> {
    const categoryRepo = dataSource.getRepository(SkillCategory);
    const count = await categoryRepo.count({
      where: { organizationId, deletedAt: IsNull() },
    });
    if (count > 0) return;

    const subcategoryRepo = dataSource.getRepository(SkillSubcategory);
    const skillRepo = dataSource.getRepository(Skill);

    let categoryOrder = 0;
    for (const categoryDef of DEFAULT_SKILL_CATALOG) {
      const category = await categoryRepo.save(
        categoryRepo.create({
          organizationId,
          name: categoryDef.name,
          isActive: true,
          sortOrder: categoryOrder++,
        }),
      );

      let subcategoryOrder = 0;
      for (const subcategoryDef of categoryDef.subcategories) {
        const subcategory = await subcategoryRepo.save(
          subcategoryRepo.create({
            organizationId,
            categoryId: category.id,
            name: subcategoryDef.name,
            isActive: true,
            sortOrder: subcategoryOrder++,
          }),
        );

        let skillOrder = 0;
        for (const skillName of subcategoryDef.skills) {
          await skillRepo.save(
            skillRepo.create({
              organizationId,
              categoryId: category.id,
              subcategoryId: subcategory.id,
              name: skillName,
              isActive: true,
              sortOrder: skillOrder++,
            }),
          );
        }
      }
    }
  }

  private mapMaster(row: NamedMaster) {
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  private mapCategory(row: SkillCategory) {
    return this.mapMaster(row);
  }

  private mapSubcategory(row: SkillSubcategory) {
    return {
      ...this.mapMaster(row),
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
    };
  }

  private mapSkill(row: Skill) {
    return {
      ...this.mapMaster(row),
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      subcategoryId: row.subcategoryId,
      subcategoryName: row.subcategory?.name ?? null,
    };
  }

  private async nextSortOrder<T extends NamedMaster>(
    repo: Repository<T>,
    where: FindOptionsWhere<T>,
  ): Promise<number> {
    const top = await repo.find({
      where: { ...where, deletedAt: IsNull() } as FindOptionsWhere<T>,
      order: { sortOrder: 'DESC' } as never,
      take: 1,
    });
    return (top[0]?.sortOrder ?? -1) + 1;
  }

  private async assertUniqueName<T extends NamedMaster>(
    repo: Repository<T>,
    where: FindOptionsWhere<T>,
    name: string,
    label: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await repo.findOne({
      where: { ...where, name, deletedAt: IsNull() } as FindOptionsWhere<T>,
    });
    if (duplicate && duplicate.id !== excludeId) {
      throw new BadRequestException(`${label} "${name}" already exists.`);
    }
  }

  async listCategories(dataSource: DataSource, organizationId: string) {
    await this.ensureDefaultCatalog(dataSource, organizationId);
    const repo = dataSource.getRepository(SkillCategory);
    const rows = await repo.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { categories: rows.map((row) => this.mapCategory(row)) };
  }

  async createCategory(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateSkillCategoryDto,
  ) {
    const name = dto.name.trim();
    const repo = dataSource.getRepository(SkillCategory);
    await this.assertUniqueName(repo, { organizationId }, name, 'Category');
    const row = await repo.save(
      repo.create({
        organizationId,
        name,
        isActive: dto.isActive ?? true,
        sortOrder: await this.nextSortOrder(repo, { organizationId }),
      }),
    );
    return this.mapCategory(row);
  }

  async updateCategory(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    dto: UpdateSkillCategoryDto,
  ) {
    const repo = dataSource.getRepository(SkillCategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Category not found.');
    }

    if (dto.name != null) {
      const name = dto.name.trim();
      await this.assertUniqueName(repo, { organizationId }, name, 'Category', id);
      row.name = name;
    }
    if (dto.isActive != null) {
      row.isActive = dto.isActive;
    }

    return this.mapCategory(await repo.save(row));
  }

  async deleteCategory(
    dataSource: DataSource,
    organizationId: string,
    id: string,
  ) {
    const repo = dataSource.getRepository(SkillCategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Category not found.');
    }

    const subcategoryCount = await dataSource.getRepository(SkillSubcategory).count({
      where: { categoryId: id, deletedAt: IsNull() },
    });
    if (subcategoryCount > 0) {
      throw new BadRequestException(
        'Cannot delete this category because subcategories exist. Deactivate it instead.',
      );
    }

    const skillCount = await dataSource.getRepository(Skill).count({
      where: { categoryId: id, deletedAt: IsNull() },
    });
    if (skillCount > 0) {
      throw new BadRequestException(
        'Cannot delete this category because skills exist. Deactivate it instead.',
      );
    }

    await repo.softRemove(row);
    return { id };
  }

  async listSubcategories(
    dataSource: DataSource,
    organizationId: string,
    query: ListSkillSubcategoriesQueryDto = {},
  ) {
    await this.ensureDefaultCatalog(dataSource, organizationId);
    const repo = dataSource.getRepository(SkillSubcategory);
    const where: FindOptionsWhere<SkillSubcategory> = {
      organizationId,
      deletedAt: IsNull(),
    };
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    const rows = await repo.find({
      where,
      relations: ['category'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { subcategories: rows.map((row) => this.mapSubcategory(row)) };
  }

  private async requireCategory(
    dataSource: DataSource,
    organizationId: string,
    categoryId: string,
  ): Promise<SkillCategory> {
    const category = await dataSource.getRepository(SkillCategory).findOne({
      where: { id: categoryId, organizationId, deletedAt: IsNull() },
    });
    if (!category) {
      throw new BadRequestException('Category not found.');
    }
    return category;
  }

  private async requireSubcategory(
    dataSource: DataSource,
    organizationId: string,
    subcategoryId: string,
  ): Promise<SkillSubcategory> {
    const subcategory = await dataSource.getRepository(SkillSubcategory).findOne({
      where: { id: subcategoryId, organizationId, deletedAt: IsNull() },
    });
    if (!subcategory) {
      throw new BadRequestException('Subcategory not found.');
    }
    return subcategory;
  }

  async createSubcategory(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateSkillSubcategoryDto,
  ) {
    const name = dto.name.trim();
    await this.requireCategory(dataSource, organizationId, dto.categoryId);
    const repo = dataSource.getRepository(SkillSubcategory);
    await this.assertUniqueName(
      repo,
      { organizationId, categoryId: dto.categoryId },
      name,
      'Subcategory',
    );

    const row = await repo.save(
      repo.create({
        organizationId,
        categoryId: dto.categoryId,
        name,
        isActive: dto.isActive ?? true,
        sortOrder: await this.nextSortOrder(repo, {
          organizationId,
          categoryId: dto.categoryId,
        }),
      }),
    );
    const saved = await repo.findOne({
      where: { id: row.id },
      relations: ['category'],
    });
    return this.mapSubcategory(saved ?? row);
  }

  async updateSubcategory(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    dto: UpdateSkillSubcategoryDto,
  ) {
    const repo = dataSource.getRepository(SkillSubcategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
      relations: ['category'],
    });
    if (!row) {
      throw new NotFoundException('Subcategory not found.');
    }

    if (dto.categoryId != null && dto.categoryId !== row.categoryId) {
      await this.requireCategory(dataSource, organizationId, dto.categoryId);
      row.categoryId = dto.categoryId;
    }

    if (dto.name != null) {
      const name = dto.name.trim();
      await this.assertUniqueName(
        repo,
        { organizationId, categoryId: row.categoryId },
        name,
        'Subcategory',
        id,
      );
      row.name = name;
    }
    if (dto.isActive != null) {
      row.isActive = dto.isActive;
    }

    const saved = await repo.save(row);
    const withRelation = await repo.findOne({
      where: { id: saved.id },
      relations: ['category'],
    });
    return this.mapSubcategory(withRelation ?? saved);
  }

  async deleteSubcategory(
    dataSource: DataSource,
    organizationId: string,
    id: string,
  ) {
    const repo = dataSource.getRepository(SkillSubcategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Subcategory not found.');
    }

    const skillCount = await dataSource.getRepository(Skill).count({
      where: { subcategoryId: id, deletedAt: IsNull() },
    });
    if (skillCount > 0) {
      throw new BadRequestException(
        'Cannot delete this subcategory because skills exist. Deactivate it instead.',
      );
    }

    await repo.softRemove(row);
    return { id };
  }

  async listSkills(
    dataSource: DataSource,
    organizationId: string,
    query: ListSkillsQueryDto = {},
  ) {
    await this.ensureDefaultCatalog(dataSource, organizationId);
    const repo = dataSource.getRepository(Skill);
    const where: FindOptionsWhere<Skill> = {
      organizationId,
      deletedAt: IsNull(),
    };
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.subcategoryId) {
      where.subcategoryId = query.subcategoryId;
    }

    const rows = await repo.find({
      where,
      relations: ['category', 'subcategory'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { skills: rows.map((row) => this.mapSkill(row)) };
  }

  async createSkill(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateSkillDto,
  ) {
    const name = dto.name.trim();
    const subcategory = await this.requireSubcategory(
      dataSource,
      organizationId,
      dto.subcategoryId,
    );
    const repo = dataSource.getRepository(Skill);
    await this.assertUniqueName(
      repo,
      { organizationId, subcategoryId: subcategory.id },
      name,
      'Skill',
    );

    const row = await repo.save(
      repo.create({
        organizationId,
        categoryId: subcategory.categoryId,
        subcategoryId: subcategory.id,
        name,
        isActive: dto.isActive ?? true,
        sortOrder: await this.nextSortOrder(repo, {
          organizationId,
          subcategoryId: subcategory.id,
        }),
      }),
    );
    const saved = await repo.findOne({
      where: { id: row.id },
      relations: ['category', 'subcategory'],
    });
    return this.mapSkill(saved ?? row);
  }

  async updateSkill(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    dto: UpdateSkillDto,
  ) {
    const repo = dataSource.getRepository(Skill);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
      relations: ['category', 'subcategory'],
    });
    if (!row) {
      throw new NotFoundException('Skill not found.');
    }

    if (dto.subcategoryId != null && dto.subcategoryId !== row.subcategoryId) {
      const subcategory = await this.requireSubcategory(
        dataSource,
        organizationId,
        dto.subcategoryId,
      );
      row.subcategoryId = subcategory.id;
      row.categoryId = subcategory.categoryId;
    }

    if (dto.name != null) {
      const name = dto.name.trim();
      await this.assertUniqueName(
        repo,
        { organizationId, subcategoryId: row.subcategoryId },
        name,
        'Skill',
        id,
      );
      row.name = name;
    }
    if (dto.isActive != null) {
      row.isActive = dto.isActive;
    }

    const saved = await repo.save(row);
    const withRelations = await repo.findOne({
      where: { id: saved.id },
      relations: ['category', 'subcategory'],
    });
    return this.mapSkill(withRelations ?? saved);
  }

  async deleteSkill(
    dataSource: DataSource,
    organizationId: string,
    id: string,
  ) {
    const repo = dataSource.getRepository(Skill);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Skill not found.');
    }

    const inUse = await dataSource.getRepository(EmployeeSkill).count({
      where: { skillId: id, deletedAt: IsNull() },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Cannot delete this skill because employees have assigned it. Deactivate it instead.',
      );
    }

    await repo.softRemove(row);
    return { id };
  }
}
