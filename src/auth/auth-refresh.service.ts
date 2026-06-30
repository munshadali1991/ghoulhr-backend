import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { RefreshSessionService } from './refresh-session.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { EmployeesService } from '../employees/employees.service';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { UserStatus } from '../users/user-status.enum';
import { EmployeeStatus } from '../employees/employee.entity';
import { RefreshSession } from './entities/refresh-session.entity';
import { OrganizationSubscriptionService } from '../subscriptions/organization-subscription.service';
import { Role } from '../roles/roles.enum';
import { AuthActorService } from './auth-actor.service';

@Injectable()
export class AuthRefreshService {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly employeesService: EmployeesService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly subscriptionService: OrganizationSubscriptionService,
    private readonly authActorService: AuthActorService,
  ) {}

  private getRefreshExpiryDate(session: RefreshSession): Date {
    const sliding = new Date(Date.now() + this.authService.getRefreshTtlMs());
    return this.authService.capExpiryDate(sliding, session.absoluteExpiresAt);
  }

  async refresh(req: Request, res: Response): Promise<{ ok: true }> {
    const refreshName = this.authCookieService.getRefreshCookieName();
    const plain = (req as { cookies?: Record<string, string> }).cookies?.[
      refreshName
    ];
    if (!plain) {
      throw new UnauthorizedException('Missing refresh session');
    }

    const session = await this.refreshSessionService.findValidByPlain(plain);
    if (!session) {
      this.authCookieService.clearAuthCookies(res);
      throw new UnauthorizedException('Session expired');
    }

    const { accessToken, refreshPlain, absoluteExpiresAt } =
      await this.mintAndRotateFromSession(session, res);
    this.authCookieService.attachAuthCookies(
      res,
      accessToken,
      refreshPlain,
      absoluteExpiresAt,
    );
    return { ok: true };
  }

  async mintAndRotateFromSession(
    session: RefreshSession,
    res?: Response,
  ): Promise<{
    accessToken: string;
    refreshPlain: string;
    absoluteExpiresAt: Date;
  }> {
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    if (session.absoluteExpiresAt.getTime() <= Date.now()) {
      await this.refreshSessionService.revokeSession(session.id);
      if (res) {
        this.authCookieService.clearAuthCookies(res);
      }
      throw new UnauthorizedException('Session expired');
    }

    const refreshExpires = this.getRefreshExpiryDate(session);
    const accessToken = await this.mintAccessFromRefreshSession(session);
    const { plain: refreshPlain } =
      await this.refreshSessionService.rotateSession(session, refreshExpires);
    return {
      accessToken,
      refreshPlain,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }

  async mintAccessFromRefreshSession(
    session: RefreshSession,
  ): Promise<string> {
    if (session.sessionKind === 'master') {
      if (!session.masterUserId) {
        throw new UnauthorizedException('Invalid refresh session');
      }
      const user = await this.usersService.findById(session.masterUserId);
      if (!user || user.status !== UserStatus.ACTIVE) {
        await this.refreshSessionService.revokeSession(session.id);
        throw new UnauthorizedException('User no longer valid');
      }
      const organization = await this.organizationsService.findById(
        user.organizationId,
      );
      if (!organization) {
        throw new UnauthorizedException('Organization not found');
      }
      if (user.role === Role.ORG_ADMIN) {
        await this.assertValidSubscriptionOrRevoke(session, organization.id);
      }
      const tokenPayload = await this.authActorService.buildMasterAccessTokenPayload(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        },
        organization,
      );
      return this.authService.mintAccessToken(
        tokenPayload,
        session.absoluteExpiresAt,
      );
    }

    if (session.sessionKind === 'employee') {
      if (!session.employeeId || !session.organizationId) {
        throw new UnauthorizedException('Invalid refresh session');
      }
      const organization = await this.organizationsService.findById(
        session.organizationId,
      );
      if (!organization) {
        await this.refreshSessionService.revokeSession(session.id);
        throw new UnauthorizedException('Organization not found');
      }
      await this.assertValidSubscriptionOrRevoke(session, organization.id);
      const tenantDs =
        await this.tenantConnectionManager.getOrCreateConnection(organization);
      const employee = await this.employeesService.findById(
        session.employeeId,
        tenantDs,
      );
      if (
        !employee ||
        employee.status === EmployeeStatus.TERMINATED ||
        employee.status === EmployeeStatus.INACTIVE
      ) {
        await this.refreshSessionService.revokeSession(session.id);
        throw new ForbiddenException('Employee account is no longer active');
      }
      return this.authService.mintAccessToken(
        {
          sub: employee.id,
          organizationId: organization.id,
          organizationSubdomain: organization.subdomain,
          email: employee.email,
          role: employee.role,
          employeeCode: employee.employeeCode,
          name: employee.name,
          mustChangePassword: employee.mustChangePassword,
        },
        session.absoluteExpiresAt,
      );
    }

    throw new UnauthorizedException('Invalid refresh session');
  }

  private async assertValidSubscriptionOrRevoke(
    session: RefreshSession,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.subscriptionService.assertOrganizationHasValidSubscription(
        organizationId,
      );
    } catch (error) {
      await this.refreshSessionService.revokeSession(session.id);
      throw error;
    }
  }

  async logout(req: Request, res: Response): Promise<{ ok: true }> {
    const refreshName = this.authCookieService.getRefreshCookieName();
    const plain = (req as { cookies?: Record<string, string> }).cookies?.[
      refreshName
    ];
    if (plain) {
      await this.refreshSessionService.revokeByRefreshPlain(plain);
    }
    this.authCookieService.clearAuthCookies(res);
    return { ok: true };
  }
}
