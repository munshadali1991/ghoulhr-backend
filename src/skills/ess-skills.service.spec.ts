import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EssSkillsService } from './ess-skills.service';
import { SkillMasterService } from './skill-master.service';
import { SkillProficiency } from './enums/skill-proficiency.enum';

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
    find: jest.fn(async (opts: { where?: Record<string, unknown>; relations?: string[] } = {}) => {
      return rows.filter((row) => matchesWhere(row, opts.where));
    }),
    findOne: jest.fn(async (opts: { where?: Record<string, unknown> } = {}) => {
      return rows.find((row) => matchesWhere(row, opts.where)) ?? null;
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

  return {
    dataSource: {
      getRepository: (entity: { name?: string }) => {
        const repo = repos[entity.name as keyof typeof repos];
        if (!repo) throw new Error(`Unexpected repository: ${entity.name}`);
        return repo;
      },
    },
    employeeSkills,
    repos,
  };
}

const orgId = 'org-1';
const employeeId = 'emp-1';
const otherEmployeeId = 'emp-2';

const activeSkill = {
  id: 'skill-1',
  organizationId: orgId,
  categoryId: 'cat-1',
  subcategoryId: 'sub-1',
  name: 'React',
  isActive: true,
  sortOrder: 0,
  deletedAt: null,
  category: { id: 'cat-1', name: 'Software Development' },
  subcategory: { id: 'sub-1', name: 'Frontend' },
};

describe('EssSkillsService', () => {
  const skillMasterService = {
    ensureDefaultCatalog: jest.fn(async () => undefined),
  };
  const service = new EssSkillsService(skillMasterService as unknown as SkillMasterService);

  it('rejects assigning an inactive skill', async () => {
    const { dataSource } = createDataSource({
      skills: [{ ...activeSkill, isActive: false }],
    });

    await expect(
      service.addSkill(dataSource as never, orgId, employeeId, {
        skillId: 'skill-1',
        experienceMonths: 12,
        proficiency: SkillProficiency.GOOD,
      }),
    ).rejects.toThrow(/not available/);
  });

  it('rejects assigning a skill from another organization', async () => {
    const { dataSource } = createDataSource({
      skills: [{ ...activeSkill, organizationId: 'other-org' }],
    });

    await expect(
      service.addSkill(dataSource as never, orgId, employeeId, {
        skillId: 'skill-1',
        experienceMonths: 12,
        proficiency: SkillProficiency.BEGINNER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate employee skill assignments', async () => {
    const { dataSource } = createDataSource({
      skills: [activeSkill],
      employeeSkills: [
        {
          id: 'es-1',
          organizationId: orgId,
          employeeId,
          skillId: 'skill-1',
          experienceMonths: 6,
          proficiency: SkillProficiency.BEGINNER,
          deletedAt: null,
        },
      ],
    });

    await expect(
      service.addSkill(dataSource as never, orgId, employeeId, {
        skillId: 'skill-1',
        experienceMonths: 12,
        proficiency: SkillProficiency.GOOD,
      }),
    ).rejects.toThrow(/already added/);
  });

  it('does not allow updating another employee skill assignment', async () => {
    const { dataSource } = createDataSource({
      employeeSkills: [
        {
          id: 'es-1',
          organizationId: orgId,
          employeeId: otherEmployeeId,
          skillId: 'skill-1',
          experienceMonths: 6,
          proficiency: SkillProficiency.BEGINNER,
          deletedAt: null,
        },
      ],
    });

    await expect(
      service.updateSkill(dataSource as never, orgId, employeeId, 'es-1', {
        experienceMonths: 24,
        proficiency: SkillProficiency.EXPERT,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds a skill for the current employee', async () => {
    const { dataSource, employeeSkills } = createDataSource({
      skills: [activeSkill],
    });

    const created = await service.addSkill(dataSource as never, orgId, employeeId, {
      skillId: 'skill-1',
      experienceMonths: 18,
      proficiency: SkillProficiency.GOOD,
    });

    expect(created.skillId).toBe('skill-1');
    expect(created.experienceMonths).toBe(18);
    expect(employeeSkills).toHaveLength(1);
    expect(employeeSkills[0].employeeId).toBe(employeeId);
  });
});
