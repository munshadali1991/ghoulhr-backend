import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  PermissionsMode,
} from '../decorators/require-permissions.decorator';
import { AuthorizationService } from '../authorization.service';
import { RbacConfigService } from '../rbac-config.service';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly rbacConfig: RbacConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.rbacConfig.isRbacEnforced()) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const mode =
      this.reflector.getAllAndOverride<PermissionsMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const req = context.switchToHttp().getRequest<TenantRequest>();
    const user = req.user;
    const organizationId = req.organization?.id;
    const tenantDataSource = req.tenantDataSource;

    if (!user?.sub || !organizationId || !tenantDataSource) {
      throw new ForbiddenException('Tenant authorization context required');
    }

    const authContext = {
      employeeId: user.sub,
      organizationId,
      tenantDataSource,
    };

    const allowed =
      mode === 'any'
        ? await this.authorizationService.hasAnyPermission(
            authContext,
            required,
            req,
          )
        : await Promise.all(
            required.map((p) =>
              this.authorizationService.hasPermission(authContext, p, req),
            ),
          ).then((results) => results.every(Boolean));

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
