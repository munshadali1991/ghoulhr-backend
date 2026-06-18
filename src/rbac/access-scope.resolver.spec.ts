import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AccessScopeResolver } from './access-scope.resolver';
import { AccessScope } from './constants/access-scope.enum';
import { Employee } from '../employees/employee.entity';
import { EmployeeReportingManager } from '../employees/entities/employee-reporting-manager.entity';

describe('AccessScopeResolver', () => {
  let resolver: AccessScopeResolver;
  let dataSource: { getRepository: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AccessScopeResolver],
    }).compile();
    resolver = module.get(AccessScopeResolver);

    dataSource = {
      getRepository: jest.fn(),
    };
  });

  it('SELF returns only actor id', async () => {
    const result = await resolver.resolveVisibleEmployeeIds(
      dataSource as unknown as DataSource,
      'actor-1',
      AccessScope.SELF,
    );
    expect(result).toEqual(['actor-1']);
  });

  it('ORGANIZATION returns null (no filter)', async () => {
    const result = await resolver.resolveVisibleEmployeeIds(
      dataSource as unknown as DataSource,
      'actor-1',
      AccessScope.ORGANIZATION,
    );
    expect(result).toBeNull();
  });

  it('DEPARTMENT returns peers in same department', async () => {
    dataSource.getRepository.mockImplementation((entity) => {
      if (entity === Employee) {
        return {
          findOne: jest.fn().mockResolvedValue({ id: 'actor-1', departmentId: 'dept-1' }),
          find: jest.fn().mockResolvedValue([{ id: 'actor-1' }, { id: 'peer-1' }]),
        };
      }
      return {};
    });

    const result = await resolver.resolveVisibleEmployeeIds(
      dataSource as unknown as DataSource,
      'actor-1',
      AccessScope.DEPARTMENT,
    );
    expect(result).toEqual(['actor-1', 'peer-1']);
  });

  it('TEAM returns actor and direct reports', async () => {
    dataSource.getRepository.mockImplementation((entity) => {
      if (entity === EmployeeReportingManager) {
        return {
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([{ employeeId: 'report-1' }]),
          }),
        };
      }
      return {};
    });

    const result = await resolver.resolveVisibleEmployeeIds(
      dataSource as unknown as DataSource,
      'actor-1',
      AccessScope.TEAM,
    );
    expect(result).toEqual(['actor-1', 'report-1']);
  });
});
