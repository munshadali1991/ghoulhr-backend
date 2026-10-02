import { NotFoundException } from '@nestjs/common';
import { HrSkillsService } from './hr-skills.service';
import { SkillProficiency } from './enums/skill-proficiency.enum';

type Row = Record<string, unknown> & { id: string; deletedAt?: Date | null };

function isNullOp(value: unknown) {
  return Boolean(value && typeof value === 'object' && 'type' in (value as object) && (value as { type: string }).type === 'isNull');
}

function isILike(value: unknown): value is { _value?: string; value?: string } {
  return Boolean(value && typeof value === 'object' && ('_type' in (value as object) || 'type' in (value as object)));
}

function matchesWhere(row: Row, where: Record<string, unknown> | Record<string, unknown>[] = {}) {
  if (Array.isArray(where)) {
    return where.some((clause) => matchesWhere(row, clause));
  }
  return Object.entries(where).every(([key, value]) => {
    if (isNullOp(value)) return row[key] == null;
    if (value && typeof value === 'object' && 'id' in (value as object)) {
      return row[key] === (value as { id: string }).id || row[`${key}Id`] === (value as { id: string }).id;
    }
    if (isILike(value) && !('id' in (value as object))) {
      const raw = String((value as { _value?: string })._value ?? (value as { value?: string }).value ?? '');
      const needle = raw.replace(/%/g, '').toLowerCase();
      return String(row[key] ?? '').toLowerCase().includes(needle);
    }
    return row[key] === value;
  });
}

function createRepo(entityName: string, rows: Row[]) {
  return {
    find: jest.fn(async (opts: { where?: Record<string, unknown> | Record<string, unknown>[] } = {}) => {
      return rows.filter((row) => matchesWhere(row, opts.where ?? {}));
    }),
    findOne: jest.fn(async (opts: { where?: Record<string, unknown> } = {}) => {
      return rows.find((row) => matchesWhere(row, opts.where ?? {})) ?? null;
    }),
  };
}

function createDataSource(seed: {
  employees?: Row[];
  employeeSkills?: Row[];
  employment?: Row[];
  managers?: Row[];
}) {
  const employees = [...(seed.employees ?? [])];
  const employeeSkills = [...(seed.employeeSkills ?? [])];
  const employment = [...(seed.employment ?? [])];
  const managers = [...(seed.managers ?? [])];
  const repos = {
    Employee: createRepo('Employee', employees),
    EmployeeSkill: createRepo('EmployeeSkill', employeeSkills),
    EmployeeEmploymentDetail: createRepo('EmployeeEmploymentDetail', employment),
    EmployeeReportingManager: createRepo('EmployeeReportingManager', managers),
  };

  return {
    getRepository: (entity: { name?: string }) => {
      const repo = repos[entity.name as keyof typeof repos];
      if (!repo) throw new Error(`Unexpected repository: ${entity.name}`);
      return repo;
    },
  };
}

const orgId = 'org-1';
const reactSkill = {
  id: 'skill-react',
  name: 'React',
  categoryId: 'cat-1',
  subcategoryId: 'sub-1',
  category: { id: 'cat-1', name: 'Software Development' },
  subcategory: { id: 'sub-1', name: 'Frontend' },
};

describe('HrSkillsService', () => {
  const storageService = {
    getAssetPreviewUrl: jest.fn(async () => null),
  };
  const essSkillsService = {
    getCatalog: jest.fn(),
  };
  const service = new HrSkillsService(essSkillsService as never, storageService as never);

  const employees = [
    {
      id: 'emp-1',
      organizationId: orgId,
      employeeCode: 'E001',
      name: 'Ada Lovelace',
      deletedAt: null,
      designationRef: { name: 'Engineer' },
      departmentRef: { name: 'Product' },
    },
    {
      id: 'emp-2',
      organizationId: orgId,
      employeeCode: 'E002',
      name: 'Grace Hopper',
      deletedAt: null,
      designationRef: { name: 'Lead' },
      departmentRef: { name: 'Engineering' },
    },
  ];

  const employeeSkills = [
    {
      id: 'as-1',
      organizationId: orgId,
      employeeId: 'emp-1',
      skillId: 'skill-react',
      skill: reactSkill,
      experienceMonths: 24,
      proficiency: SkillProficiency.EXPERT,
      deletedAt: null,
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
    {
      id: 'as-2',
      organizationId: orgId,
      employeeId: 'emp-2',
      skillId: 'skill-sql',
      skill: {
        id: 'skill-sql',
        name: 'SQL',
        categoryId: 'cat-1',
        subcategoryId: 'sub-2',
        category: { id: 'cat-1', name: 'Software Development' },
        subcategory: { id: 'sub-2', name: 'Data' },
      },
      experienceMonths: 6,
      proficiency: SkillProficiency.GOOD,
      deletedAt: null,
      updatedAt: new Date('2026-01-15T00:00:00.000Z'),
    },
  ];

  it('returns employees matching a skill filter', async () => {
    const dataSource = createDataSource({ employees, employeeSkills });
    const result = await service.searchEmployees(dataSource as never, orgId, null, {
      skillId: 'skill-react',
    });
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].id).toBe('emp-1');
    expect(result.employees[0].topSkills[0].skillName).toBe('React');
  });

  it('restricts search to TEAM visible ids', async () => {
    const dataSource = createDataSource({ employees, employeeSkills });
    const result = await service.searchEmployees(dataSource as never, orgId, ['emp-1'], {});
    expect(result.employees.map((row) => row.id)).toEqual(['emp-1']);
  });

  it('returns 404 when the profile is out of scope', async () => {
    const dataSource = createDataSource({ employees, employeeSkills });
    await expect(
      service.getEmployeeProfile(dataSource as never, orgId, ['emp-1'], 'emp-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('groups profile skills by category and subcategory', async () => {
    const dataSource = createDataSource({
      employees,
      employeeSkills,
      employment: [{ id: 'ed-1', employeeId: 'emp-1', totalExperienceYears: '5.50', deletedAt: null }],
      managers: [],
    });
    const profile = await service.getEmployeeProfile(dataSource as never, orgId, null, 'emp-1');
    expect(profile.counts.expert).toBe(1);
    expect(profile.groups[0].categoryName).toBe('Software Development');
    expect(profile.groups[0].subcategories[0].skills[0].skillName).toBe('React');
  });
});
