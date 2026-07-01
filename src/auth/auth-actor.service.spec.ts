import { AuthActorService } from './auth-actor.service';
import { Role } from '../roles/roles.enum';
import type { DataSource } from 'typeorm';

describe('AuthActorService', () => {
  const tenantDataSource = {} as DataSource;
  const employeesService = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };
  const tenantConnectionManager = {
    getOrCreateConnection: jest.fn(),
  };

  let service: AuthActorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthActorService(
      employeesService as never,
      tenantConnectionManager as never,
    );
  });

  it('uses payload.sub when employeeCode is present', async () => {
    employeesService.findById.mockResolvedValue({ id: 'emp-1', email: 'a@b.com' });

    const employee = await service.resolveTenantEmployee(
      {
        sub: 'emp-1',
        email: 'a@b.com',
        employeeCode: 'E001',
        role: 'ORG_ADMIN',
      },
      tenantDataSource,
    );

    expect(employee?.id).toBe('emp-1');
    expect(employeesService.findByEmail).not.toHaveBeenCalled();
  });

  it('falls back to email lookup for master org admin tokens', async () => {
    employeesService.findByEmail.mockResolvedValue({
      id: 'emp-2',
      email: 'admin@buggy.com',
    });

    const employeeId = await service.resolveTenantEmployeeId(
      {
        sub: 'master-user-id',
        email: 'admin@buggy.com',
        role: Role.ORG_ADMIN,
      },
      tenantDataSource,
    );

    expect(employeeId).toBe('emp-2');
    expect(employeesService.findByEmail).toHaveBeenCalledWith(
      'admin@buggy.com',
      tenantDataSource,
    );
  });

  it('mints employee-scoped payload for org admin master login', async () => {
    tenantConnectionManager.getOrCreateConnection.mockResolvedValue(tenantDataSource);
    employeesService.findByEmail.mockResolvedValue({
      id: 'emp-3',
      employeeCode: 'ADM001',
      name: 'Org Admin',
      mustChangePassword: false,
      email: 'admin@buggy.com',
    });

    const payload = await service.buildMasterAccessTokenPayload(
      {
        id: 'master-user-id',
        email: 'admin@buggy.com',
        role: Role.ORG_ADMIN,
        organizationId: 'org-1',
      },
      { subdomain: 'buggy' } as never,
    );

    expect(payload.sub).toBe('emp-3');
    expect(payload.employeeCode).toBe('ADM001');
    expect(payload.name).toBe('Org Admin');
  });
});
