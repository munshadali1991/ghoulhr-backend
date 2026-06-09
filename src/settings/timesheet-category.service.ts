import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { TimesheetCategory } from '../ess/entities/timesheet-category.entity';
import { TimesheetEntry } from '../ess/entities/timesheet-entry.entity';
import {
  CreateTimesheetCategoryDto,
  UpdateTimesheetCategoryDto,
} from './dto/timesheet-category.dto';

export const DEFAULT_TIMESHEET_CATEGORY_NAMES = [
  'Development',
  'Bug Fix',
  'Testing',
  'Meeting',
  'Research',
  'Documentation',
  'Deployment',
  'Support',
];

@Injectable()
export class TimesheetCategoryService {
  async ensureDefaultCategories(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<void> {
    const repo = dataSource.getRepository(TimesheetCategory);
    const count = await repo.count({
      where: { organizationId, deletedAt: IsNull() },
    });
    if (count > 0) return;

    let order = 0;
    for (const name of DEFAULT_TIMESHEET_CATEGORY_NAMES) {
      await repo.save(
        repo.create({
          organizationId,
          name,
          isActive: true,
          sortOrder: order++,
        }),
      );
    }
  }

  private mapToApi(row: TimesheetCategory) {
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }

  async listCategories(dataSource: DataSource, organizationId: string) {
    await this.ensureDefaultCategories(dataSource, organizationId);
    const repo = dataSource.getRepository(TimesheetCategory);
    const rows = await repo.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { categories: rows.map((r) => this.mapToApi(r)) };
  }

  async listActiveCategories(dataSource: DataSource, organizationId: string) {
    await this.ensureDefaultCategories(dataSource, organizationId);
    const repo = dataSource.getRepository(TimesheetCategory);
    const rows = await repo.find({
      where: { organizationId, isActive: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return { categories: rows.map((r) => this.mapToApi(r)) };
  }

  async createCategory(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateTimesheetCategoryDto,
  ) {
    const name = dto.name.trim();
    const repo = dataSource.getRepository(TimesheetCategory);
    const duplicate = await repo.findOne({
      where: { organizationId, name, deletedAt: IsNull() },
    });
    if (duplicate) {
      throw new BadRequestException(`Category "${name}" already exists.`);
    }

    const maxOrder = await repo
      .createQueryBuilder('c')
      .select('MAX(c.sortOrder)', 'max')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('c.deletedAt IS NULL')
      .getRawOne<{ max: string | null }>();

    const row = await repo.save(
      repo.create({
        organizationId,
        name,
        isActive: dto.isActive ?? true,
        sortOrder: (Number(maxOrder?.max ?? -1) + 1),
      }),
    );
    return this.mapToApi(row);
  }

  async updateCategory(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    dto: UpdateTimesheetCategoryDto,
  ) {
    const repo = dataSource.getRepository(TimesheetCategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Category not found.');
    }

    if (dto.name != null) {
      const name = dto.name.trim();
      const duplicate = await repo
        .createQueryBuilder('c')
        .where('c.organizationId = :organizationId', { organizationId })
        .andWhere('c.name = :name', { name })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('c.id != :id', { id })
        .getOne();
      if (duplicate) {
        throw new BadRequestException(`Category "${name}" already exists.`);
      }
      row.name = name;
    }
    if (dto.isActive != null) {
      row.isActive = dto.isActive;
    }

    const saved = await repo.save(row);
    return this.mapToApi(saved);
  }

  async deleteCategory(dataSource: DataSource, organizationId: string, id: string) {
    const repo = dataSource.getRepository(TimesheetCategory);
    const row = await repo.findOne({
      where: { id, organizationId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Category not found.');
    }

    const entryRepo = dataSource.getRepository(TimesheetEntry);
    const inUse = await entryRepo.count({ where: { categoryId: id } });
    if (inUse > 0) {
      throw new BadRequestException(
        'Cannot delete this category because timesheet entries reference it. Deactivate it instead.',
      );
    }

    await repo.softRemove(row);
    return { id };
  }
}
