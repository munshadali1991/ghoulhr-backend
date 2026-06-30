import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AuthorizationService } from '../authorization.service';
import { RbacConfigService } from '../rbac-config.service';
import { AuthActorService } from '../../auth/auth-actor.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const authorizationService = {
    hasPermission: jest.fn(),
    hasAnyPermission: jest.fn(),
  };
  const rbacConfig = {
    isRbacEnforced: jest.fn().mockReturnValue(true),
    isSettingsEnforced: jest.fn().mockReturnValue(true),
    isEmployeesEnforced: jest.fn().mockReturnValue(true),
  };
  const authActorService = {
    resolveTenantEmployeeId: jest.fn(),
  };

  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      authorizationService as unknown as AuthorizationService,
      rbacConfig as unknown as RbacConfigService,
      authActorService as unknown as AuthActorService,
    );
  });

  function buildContext(req: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  it('checks permissions against resolved tenant employee id', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === PERMISSIONS_KEY) return ['dashboard.hr:read'];
      return undefined;
    });
    authActorService.resolveTenantEmployeeId.mockResolvedValue('emp-tenant-1');
    authorizationService.hasPermission.mockResolvedValue(true);

    const req = {
      user: {
        sub: 'master-user-id',
        email: 'admin@buggy.com',
        role: 'ORG_ADMIN',
      },
      organization: { id: 'org-1' },
      tenantDataSource: {},
    };

    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);

    expect(authActorService.resolveTenantEmployeeId).toHaveBeenCalledWith(
      req.user,
      req.tenantDataSource,
    );
    expect(authorizationService.hasPermission).toHaveBeenCalledWith(
      {
        employeeId: 'emp-tenant-1',
        organizationId: 'org-1',
        tenantDataSource: req.tenantDataSource,
      },
      'dashboard.hr:read',
      req,
    );
  });

  it('rejects when no tenant employee profile exists', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === PERMISSIONS_KEY) return ['dashboard.hr:read'];
      return undefined;
    });
    authActorService.resolveTenantEmployeeId.mockResolvedValue(null);

    const req = {
      user: {
        sub: 'master-user-id',
        email: 'admin@buggy.com',
        role: 'ORG_ADMIN',
      },
      organization: { id: 'org-1' },
      tenantDataSource: {},
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      new ForbiddenException('Employee profile required for portal access'),
    );
  });
});
