import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Employee, EmployeeStatus } from './employee.entity';
import { ReportingManagersService } from './reporting-managers.service';

describe('ReportingManagersService', () => {
  let service: ReportingManagersService;
  let dataSource: { getRepository: jest.Mock; transaction: jest.Mock };

  const managerId = '11111111-1111-1111-1111-111111111111';
  const employeeId = '22222222-2222-2222-2222-222222222222';
  const nonManagerId = '33333333-3333-3333-3333-333333333333';

  function mockManagerQueryBuilder(rows: Record<string, unknown>[]) {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
      getRawOne: jest.fn().mockResolvedValue(rows[0] ?? null),
    };
    return qb;
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ReportingManagersService],
    }).compile();
    service = module.get(ReportingManagersService);

    dataSource = {
      getRepository: jest.fn(),
      transaction: jest.fn(async (fn) => fn(dataSource)),
    };
  });

  describe('listManagerCandidates', () => {
    it('returns employees with active MANAGER role', async () => {
      const qb = mockManagerQueryBuilder([
        {
          id: managerId,
          name: 'Alice Manager',
          employeeCode: 'EMP001',
          status: EmployeeStatus.ACTIVE,
        },
      ]);
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
        }
        return {};
      });

      const result = await service.listManagerCandidates(
        dataSource as unknown as DataSource,
        null,
      );

      expect(result).toEqual([
        {
          id: managerId,
          name: 'Alice Manager',
          employeeCode: 'EMP001',
          status: EmployeeStatus.ACTIVE,
        },
      ]);
    });

    it('excludes employees without MANAGER role when query returns empty', async () => {
      const qb = mockManagerQueryBuilder([]);
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
        }
        return {};
      });

      const result = await service.listManagerCandidates(
        dataSource as unknown as DataSource,
        null,
      );

      expect(result).toEqual([]);
    });

    it('returns empty array when visible employee scope is empty', async () => {
      const result = await service.listManagerCandidates(
        dataSource as unknown as DataSource,
        [],
      );

      expect(result).toEqual([]);
      expect(dataSource.getRepository).not.toHaveBeenCalled();
    });

    it('restricts candidates to visible employee ids', async () => {
      const qb = mockManagerQueryBuilder([]);
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
        }
        return {};
      });

      await service.listManagerCandidates(
        dataSource as unknown as DataSource,
        [managerId],
      );

      expect(qb.andWhere).toHaveBeenCalledWith('e.id IN (:...visibleIds)', {
        visibleIds: [managerId],
      });
    });
  });

  describe('assertEligibleReportingManager', () => {
    it('passes when employee has MANAGER role', async () => {
      const qb = mockManagerQueryBuilder([{ id: managerId }]);
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
        }
        return {};
      });

      await expect(
        service.assertEligibleReportingManager(
          dataSource as unknown as DataSource,
          managerId,
        ),
      ).resolves.toBeUndefined();
    });

    it('throws when employee does not have MANAGER role', async () => {
      const qb = mockManagerQueryBuilder([]);
      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
        }
        return {};
      });

      await expect(
        service.assertEligibleReportingManager(
          dataSource as unknown as DataSource,
          nonManagerId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignOrChange', () => {
    it('rejects non-manager employees', async () => {
      const managerQb = mockManagerQueryBuilder([]);
      const empRepo = {
        findOne: jest.fn().mockImplementation(({ where }) => {
          if (where.id === employeeId) {
            return Promise.resolve({
              id: employeeId,
              status: EmployeeStatus.ACTIVE,
            });
          }
          if (where.id === nonManagerId) {
            return Promise.resolve({
              id: nonManagerId,
              status: EmployeeStatus.ACTIVE,
            });
          }
          return Promise.resolve(null);
        }),
      };

      dataSource.getRepository.mockImplementation((entity) => {
        if (entity === Employee) {
          return {
            ...empRepo,
            createQueryBuilder: jest.fn().mockReturnValue(managerQb),
          };
        }
        return {};
      });

      await expect(
        service.assignOrChange(dataSource as unknown as DataSource, employeeId, {
          managerEmployeeId: nonManagerId,
        }),
      ).rejects.toThrow('Selected employee does not have the Manager role');
    });
  });
});
