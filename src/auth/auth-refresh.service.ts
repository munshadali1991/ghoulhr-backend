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
  ) {}

  private getRefreshExpiryDate(): Date {
    const ttlMs = this.authService.getRefreshTtlMs();
    return new Date(Date.now() + ttlMs);
  }

  async refresh(req: Request, res: Response): Promise<{ ok: true }> {
    const refreshName = this.authCookieService.getRefreshCookieName();
    const plain = req.cookies?.[refreshName];
    if (!plain) {
      throw new UnauthorizedException('Missing refresh session');
    }

    const session = await this.refreshSessionService.findValidByPlain(plain);
    if (!session) {
      this.authCookieService.clearAuthCookies(res);
      throw new UnauthorizedException('Invalid refresh session');
    }

    const refreshExpires = this.getRefreshExpiryDate();
    let accessToken: string;

    if (session.sessionKind === 'master') {
      if (!session.masterUserId) {
        throw new UnauthorizedException('Invalid refresh session');
      }
      const user = await this.usersService.findById(session.masterUserId);
      if (!user || user.status !== UserStatus.ACTIVE) {
        await this.refreshSessionService.revokeSession(session.id);
        this.authCookieService.clearAuthCookies(res);
        throw new UnauthorizedException('User no longer valid');
      }
      const organization = await this.organizationsService.findById(
        user.organizationId,
      );
      if (!organization) {
        throw new UnauthorizedException('Organization not found');
      }
      accessToken = this.authService.mintAccessToken({
        sub: user.id,
        organizationId: user.organizationId,
        organizationSubdomain: organization.subdomain,
        email: user.email,
        role: user.role,
      });
    } else if (session.sessionKind === 'employee') {
      if (!session.employeeId || !session.organizationId) {
        throw new UnauthorizedException('Invalid refresh session');
      }
      const organization = await this.organizationsService.findById(
        session.organizationId,
      );
      if (!organization) {
        await this.refreshSessionService.revokeSession(session.id);
        this.authCookieService.clearAuthCookies(res);
        throw new UnauthorizedException('Organization not found');
      }
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
        this.authCookieService.clearAuthCookies(res);
        throw new ForbiddenException('Employee account is no longer active');
      }
      accessToken = this.authService.mintAccessToken({
        sub: employee.id,
        organizationId: organization.id,
        organizationSubdomain: organization.subdomain,
        email: employee.email,
        role: employee.role,
        employeeCode: employee.employeeCode,
        name: employee.name,
      });
    } else {
      throw new UnauthorizedException('Invalid refresh session');
    }

    const { plain: newRefreshPlain } =
      await this.refreshSessionService.rotateSession(session, refreshExpires);
    this.authCookieService.attachAuthCookies(res, accessToken, newRefreshPlain);
    return { ok: true };
  }

  async logout(req: Request, res: Response): Promise<{ ok: true }> {
    const refreshName = this.authCookieService.getRefreshCookieName();
    const plain = req.cookies?.[refreshName];
    if (plain) {
      await this.refreshSessionService.revokeByRefreshPlain(plain);
    }
    this.authCookieService.clearAuthCookies(res);
    return { ok: true };
  }
}
