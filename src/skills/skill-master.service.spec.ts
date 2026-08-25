import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SkillMasterService } from './skill-master.service';
import { SkillCategory } from './entities/skill-category.entity';
import { SkillSubcategory } from './entities/skill-subcategory.entity';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';

type Row = Record<string, unknown> & { id: string; deletedAt?: Date | null };

function matchesWhere(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'type' in value && (value as { type: string }).type === 'isNull') {
      return row[key] == null;
    }
    return row[key] === value;
  });
}

function createRepo(entityName: string, rows: Row[]) {
  return {
    metadata: { name: entityName },
    find: jest.fn(async (opts: { where?: Record<string, unknown>; take?: number; order?: Record<string, string> } = {}) => {
      let result = rows.filter((row) => matchesWhere(row, opts.where));
      if (opts.order?.sortOrder === 'DESC') {
        result = [...result].sort((a, b) => Number(b.sortOrder ?? 0) - Number(a.sortOrder ?? 0));
      }
      if (opts.take) result = result.slice(0, opts.take);
      return result;
    }),
    findOne: jest.fn(async (opts: { where?: Record<string, unknown>; relations?: string[] } = {}) => {
      return rows.find((row) => matchesWhere(row, opts.where)) ?? null;
    }),
    count: jest.fn(async (opts: { where?: Record<string, unknown> } = {}) => {
      return rows.filter((row) => matchesWhere(row, opts.where)).length;
    }),
    create: jest.fn((data: Row) => ({
      id: data.id ?? `${entityName}-${rows.length + 1}`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      ...data,
    })),
    save: jest.fn(async (row: Row) => {
      const idx = rows.findIndex((item) => item.id === row.id);
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      return row;
    }),
    softRemove: jest.fn(async (row: Row) => {
      row.deletedAt = new Date();
    }),
  };
}

function createDataSource(seed?: {
  categories?: Row[];
  subcategories?: Row[];
  skills?: Row[];
  employeeSkills?: Row[];
}) {
  const categories = [...(seed?.categories ?? [])];
  const subcategories = [...(seed?.subcategories ?? [])];
  const skills = [...(seed?.skills ?? [])];
  const employeeSkills = [...(seed?.employeeSkills ?? [])];

  const repos = {
    SkillCategory: createRepo('SkillCategory', categories),
    SkillSubcategory: createRepo('SkillSubcategory', subcategories),
    Skill: createRepo('Skill', skills),
    EmployeeSkill: createRepo('EmployeeSkill', employeeSkills),
  };

  const dataSource = {
    getRepository: (entity: { name?: string }) => {
      const repo = repos[entity.name as keyof typeof repos];
      if (!repo) throw new Error(`Unexpected repository: ${entity.name}`);
      return repo;
    },
  };

  return { dataSource, categories, subcategories, skills, employeeSkills, repos };
}

const orgId = 'org-1';

describe('SkillMasterService', () => {
  const service = new SkillMasterService();

  it('rejects duplicate category names', async () => {
    const { dataSource } = createDataSource({
      categories: [
        {
          id: 'cat-1',
          organizationId: orgId,
          name: 'Design',
          isActive: true,
          sortOrder: 0,
          deletedAt: null,
        },
      ],
    });

    await expect(
      service.createCategory(dataSource as never, orgId, { name: 'Design' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a unique category', async () => {
    const { dataSource, categories } = createDataSource({ categories: [] });
    const created = await service.createCategory(dataSource as never, orgId, {
      name: '  Software Development  ',
    });
    expect(created.name).toBe('Software Development');
    expect(categories).toHaveLength(1);
  });

  it('blocks deleting a category that still has subcategories', async () => {
    const { dataSource } = createDataSource({
      categories: [
        {
          id: 'cat-1',
          organizationId: orgId,
          name: 'Design',
          isActive: true,
          sortOrder: 0,
          deletedAt: null,
        },
      ],
      subcategories: [
        {
          id: 'sub-1',
          organizationId: orgId,
          categoryId: 'cat-1',
          name: 'UI/UX',
          isActive: true,
          sortOrder: 0,
          deletedAt: null,
        },
      ],
    });

    await expect(
      service.deleteCategory(dataSource as never, orgId, 'cat-1'),
    ).rejects.toThrow(/subcategories exist/);
  });

  it('soft-deletes an unused category', async () => {
    const { dataSource, repos } = createDataSource({
      categories: [
        {
          id: 'cat-1',
          organizationId: orgId,
          name: 'Design',
          isActive: true,
          sortOrder: 0,
          deletedAt: null,
        },
      ],
    });

    await service.deleteCategory(dataSource as never, orgId, 'cat-1');
    expect(repos.SkillCategory.softRemove).toHaveBeenCalled();
  });

  it('blocks deleting a skill assigned to employees', async () => {
    const { dataSource } = createDataSource({
      skills: [
        {
          id: 'skill-1',
          organizationId: orgId,
          categoryId: 'cat-1',
          subcategoryId: 'sub-1',
          name: 'React',
          isActive: true,
          sortOrder: 0,
          deletedAt: null,
        },
      ],
      employeeSkills: [
        {
          id: 'es-1',
          organizationId: orgId,
          employeeId: 'emp-1',
          skillId: 'skill-1',
          experienceMonths: 12,
          proficiency: 'GOOD',
          deletedAt: null,
        },
      ],
    });

    await expect(
      service.deleteSkill(dataSource as never, orgId, 'skill-1'),
    ).rejects.toThrow(/employees have assigned it/);
  });

  it('returns not found for a missing skill', async () => {
    const { dataSource } = createDataSource();
    await expect(
      service.updateSkill(dataSource as never, orgId, 'missing', { name: 'Go' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SkillMasterService entity names', () => {
  it('uses TypeORM entity class names', () => {
    expect(SkillCategory.name).toBe('SkillCategory');
    expect(SkillSubcategory.name).toBe('SkillSubcategory');
    expect(Skill.name).toBe('Skill');
    expect(EmployeeSkill.name).toBe('EmployeeSkill');
  });
});
