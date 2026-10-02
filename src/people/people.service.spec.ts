import { NotFoundException } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PeopleView } from './dto/list-people-query.dto';
import { EmployeeStatus } from '../employees/employee.entity';

type RawRow = Record<string, unknown>;

function createListQueryBuilder(seed: {
  count: number;
  rows: RawRow[];
}) {
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb;

  qb.leftJoin = jest.fn(chain);
  qb.where = jest.fn(chain);
  qb.andWhere = jest.fn(chain);
  qb.select = jest.fn(chain);
  qb.orderBy = jest.fn(chain);
  qb.offset = jest.fn(chain);
  qb.limit = jest.fn(chain);
  qb.clone = jest.fn(() => qb);
  qb.getCount = jest.fn(async () => seed.count);
  qb.getRawMany = jest.fn(async () => seed.rows);

  return qb;
}

function createReportingQb(rows: Array<{ employeeId: string; managerEmployeeId: string }>) {
  const filtered = { managerId: '' as string };
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb;
  qb.where = jest.fn((_c: string, p: { managerId: string }) => {
    filtered.managerId = p.managerId;
    return qb;
  });
  qb.andWhere = jest.fn(chain);
  qb.getMany = jest.fn(async () =>
    rows.filter((r) => r.managerEmployeeId === filtered.managerId),
  );
  return qb;
}

function createProfileManagerQb(link: Record<string, unknown> | null) {
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb;
  qb.leftJoinAndSelect = jest.fn(chain);
  qb.where = jest.fn(chain);
  qb.andWhere = jest.fn(chain);
  qb.orderBy = jest.fn(chain);
  qb.getOne = jest.fn(async () => link);
  return qb;
}

describe('PeopleService', () => {
  const storageService = {
    getAssetPreviewUrl: jest.fn(async () => 'https://cdn.example/photo.jpg'),
  };

  const service = new PeopleService(storageService as never);

  beforeEach(() => {
    storageService.getAssetPreviewUrl.mockClear();
  });

  describe('listPeople', () => {
    it('returns empty page for team view with no direct reports', async () => {
      const reportQb = createReportingQb([]);
      const dataSource = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => reportQb),
        })),
      };

      const result = await service.listPeople(
        dataSource as never,
        'org-1',
        'mgr-1',
        null,
        { view: PeopleView.TEAM, page: 1, limit: 20 },
      );

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('excludes self from team report ids and scopes the list', async () => {
      const reportQb = createReportingQb([
        { employeeId: 'mgr-1', managerEmployeeId: 'mgr-1' },
        { employeeId: 'emp-2', managerEmployeeId: 'mgr-1' },
        { employeeId: 'emp-3', managerEmployeeId: 'mgr-1' },
      ]);

      const listQb = createListQueryBuilder({
        count: 2,
        rows: [
          {
            id: 'emp-2',
            employeeCode: 'E002',
            name: 'Bob',
            email: 'bob@ex.com',
            phoneNumber: null,
            status: EmployeeStatus.ACTIVE,
            dateOfJoining: '2024-01-01',
            profilePhotoStorageKey: 'photos/bob.jpg',
            profilePhotoUrl: null,
            organizationId: 'org-1',
            departmentName: 'Engineering',
            designationName: 'Dev',
          },
        ],
      });

      let call = 0;
      const dataSource = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => {
            call += 1;
            return call === 1 ? reportQb : listQb;
          }),
        })),
      };

      const result = await service.listPeople(
        dataSource as never,
        'org-1',
        'mgr-1',
        null,
        { view: PeopleView.TEAM, page: 1, limit: 20 },
      );

      expect(listQb.andWhere).toHaveBeenCalledWith(
        'e.id IN (:...scopedIds)',
        expect.objectContaining({
          scopedIds: expect.arrayContaining(['emp-2', 'emp-3']),
        }),
      );
      const scopedCall = listQb.andWhere.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('scopedIds'),
      );
      expect(scopedCall?.[1].scopedIds).not.toContain('mgr-1');
      expect(result.total).toBe(2);
      expect(result.items[0].name).toBe('Bob');
      expect(result.items[0].profilePhotoPreviewUrl).toBe(
        'https://cdn.example/photo.jpg',
      );
      expect(result.items[0]).not.toHaveProperty('salaryDetail');
      expect(result.items[0]).not.toHaveProperty('bankDetail');
      expect(result.items[0]).not.toHaveProperty('panNumberEnc');
    });

    it('returns empty when everyone scope is an empty array', async () => {
      const dataSource = { getRepository: jest.fn() };
      const result = await service.listPeople(
        dataSource as never,
        'org-1',
        'emp-1',
        [],
        { view: PeopleView.EVERYONE },
      );
      expect(result.total).toBe(0);
      expect(dataSource.getRepository).not.toHaveBeenCalled();
    });

    it('applies pagination metadata for everyone with org scope', async () => {
      const listQb = createListQueryBuilder({
        count: 45,
        rows: [],
      });
      const dataSource = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => listQb),
        })),
      };

      const result = await service.listPeople(
        dataSource as never,
        'org-1',
        'hr-1',
        null,
        { view: PeopleView.EVERYONE, page: 2, limit: 20 },
      );

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(3);
      expect(listQb.offset).toHaveBeenCalledWith(20);
      expect(listQb.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('getPersonProfile', () => {
    it('throws 404 when employee is out of scope and not a direct report', async () => {
      const reportQb = createReportingQb([]);
      const dataSource = {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => reportQb),
          findOne: jest.fn(),
        })),
      };

      await expect(
        service.getPersonProfile(
          dataSource as never,
          'org-1',
          'emp-1',
          ['emp-1'],
          'emp-999',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns directory profile without sensitive fields', async () => {
      const employee = {
        id: 'emp-2',
        organizationId: 'org-1',
        employeeCode: 'E002',
        name: 'Bob',
        email: 'bob@ex.com',
        phoneNumber: '999',
        status: EmployeeStatus.ACTIVE,
        departmentId: 'dept-1',
        designationId: 'desig-1',
        dateOfJoining: new Date('2023-06-15'),
        profilePhotoStorageKey: null,
        profilePhotoUrl: null,
        address: '92 Miles Drive',
        departmentRef: { name: 'Engineering' },
        designationRef: { name: 'Developer' },
        salaryDetail: { ctc: 1000000 },
        bankDetail: { accountLastFour: '1234' },
        panNumberEnc: 'enc',
      };

      const managerQb = createProfileManagerQb({
        manager: {
          id: 'mgr-1',
          name: 'Alice',
          designationRef: { name: 'Engineering Manager' },
        },
      });

      const dataSource = {
        getRepository: jest.fn((entity: { name?: string }) => {
          if (entity.name === 'Employee') {
            return {
              findOne: jest.fn(async () => employee),
              createQueryBuilder: jest.fn(),
            };
          }
          return {
            createQueryBuilder: jest.fn(() => managerQb),
          };
        }),
      };

      const profile = await service.getPersonProfile(
        dataSource as never,
        'org-1',
        'hr-1',
        null,
        'emp-2',
      );

      expect(profile).toMatchObject({
        id: 'emp-2',
        name: 'Bob',
        address: '92 Miles Drive',
        departmentName: 'Engineering',
        designationName: 'Developer',
        manager: {
          id: 'mgr-1',
          name: 'Alice',
          designationName: 'Engineering Manager',
        },
      });
      expect(profile).not.toHaveProperty('salaryDetail');
      expect(profile).not.toHaveProperty('bankDetail');
      expect(profile).not.toHaveProperty('panNumberEnc');
      expect(profile).not.toHaveProperty('password');
    });

    it('allows detail when target is a direct report even if not in everyone scope', async () => {
      const reportQb = createReportingQb([
        { employeeId: 'emp-2', managerEmployeeId: 'mgr-1' },
      ]);
      const employee = {
        id: 'emp-2',
        organizationId: 'org-1',
        employeeCode: 'E002',
        name: 'Bob',
        email: 'bob@ex.com',
        phoneNumber: null,
        status: EmployeeStatus.ACTIVE,
        departmentId: null,
        designationId: null,
        dateOfJoining: null,
        profilePhotoStorageKey: null,
        profilePhotoUrl: null,
        departmentRef: null,
        designationRef: null,
      };
      const managerQb = createProfileManagerQb(null);

      let qbCalls = 0;
      const dataSource = {
        getRepository: jest.fn((entity: { name?: string }) => {
          if (entity.name === 'Employee') {
            return {
              findOne: jest.fn(async () => employee),
            };
          }
          return {
            createQueryBuilder: jest.fn(() => {
              qbCalls += 1;
              // first call: isDirectReport via getDirectReportIds
              // second: manager link for profile
              return qbCalls === 1 ? reportQb : managerQb;
            }),
          };
        }),
      };

      const profile = await service.getPersonProfile(
        dataSource as never,
        'org-1',
        'mgr-1',
        ['mgr-1'],
        'emp-2',
      );

      expect(profile.id).toBe('emp-2');
      expect(profile.manager).toBeNull();
    });
  });
});
