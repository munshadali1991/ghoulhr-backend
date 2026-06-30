import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { AuthCookieService } from './auth-cookie.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';
import { AuthHandoffService } from './auth-handoff.service';
import { ConsumeHandoffDto } from './dto/consume-handoff.dto';
import { TenantAuthService } from './tenant-auth.service';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantAuthService: TenantAuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly authRefreshService: AuthRefreshService,
    private readonly authSessionService: AuthSessionService,
    private readonly authHandoffService: AuthHandoffService,
  ) {}

  @Get('session')
  @ApiOperation({
    summary: 'Current session from access cookie (or Bearer for tooling)',
  })
  @ApiResponse({ status: 200, description: 'Authenticated user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async getSession(@Req() req: Request) {
    const token = this.authCookieService.readAccessToken(req);
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }
    const payload = this.authService.verifyAccessToken(token);
    const session = await this.authSessionService.buildSessionResponse(payload);
    const sessionExpiresAt = payload.sessionExp
      ? new Date(payload.sessionExp * 1000).toISOString()
      : undefined;
    return {
      ...session,
      ...(sessionExpiresAt ? { sessionExpiresAt } : {}),
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh cookie and re-issue access cookie' })
  @ApiResponse({ status: 200, description: 'Cookies updated' })
  @ApiResponse({ status: 401, description: 'Invalid refresh session' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authRefreshService.refresh(req, res);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh session and clear auth cookies' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authRefreshService.logout(req, res);
  }

  @Post('handoff/consume')
  @ApiOperation({
    summary: 'Exchange a one-time handoff code for auth cookies on tenant host',
  })
  @ApiResponse({ status: 200, description: 'Cookies set on current API host' })
  @ApiResponse({ status: 401, description: 'Invalid or expired handoff code' })
  @ApiResponse({ status: 403, description: 'Handoff not valid for this host' })
  async consumeHandoff(
    @Body() dto: ConsumeHandoffDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshPlain, absoluteExpiresAt } =
      await this.authHandoffService.consume(dto.code, req.headers.host);
    this.authCookieService.attachAuthCookies(
      res,
      accessToken,
      refreshPlain,
      absoluteExpiresAt,
    );
    return { ok: true };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a user in the tenant organization' })
  @ApiHeader({
    name: 'x-bootstrap-admin-key',
    required: false,
    description: 'Required only when assigning SUPER_ADMIN role',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid payload or organization' })
  @ApiResponse({ status: 403, description: 'Role assignment forbidden' })
  @ApiResponse({
    status: 409,
    description: 'User already exists in organization',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-bootstrap-admin-key') bootstrapAdminKey?: string,
  ) {
    const result = await this.authService.register(dto, req, bootstrapAdminKey);
    this.authCookieService.attachAuthCookies(
      res,
      result.accessToken,
      result.refreshPlain,
      result.absoluteExpiresAt,
    );
    return { user: result.user };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Unified tenant login (employee-first); super admin fallback',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'User inactive' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: TenantRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    let result: {
      accessToken: string;
      refreshPlain: string;
      refreshSessionId: string;
      absoluteExpiresAt: Date;
      user: {
        organizationSubdomain?: string;
        role: string;
        [key: string]: unknown;
      };
      requiresPasswordChange?: boolean;
    };

    try {
      const tenantResult = await this.tenantAuthService.login(
        dto,
        req.tenantDataSource,
        req.organization,
      );
      result = tenantResult;
    } catch (err) {
      if (!(err instanceof UnauthorizedException)) {
        throw err;
      }
      result = await this.authService.login(dto, req);
    }

    this.authCookieService.attachAuthCookies(
      res,
      result.accessToken,
      result.refreshPlain,
      result.absoluteExpiresAt,
    );

    const response: {
      user: typeof result.user;
      requiresPasswordChange?: boolean;
      handoff?: string;
    } = {
      user: result.user,
      ...(result.requiresPasswordChange
        ? { requiresPasswordChange: true }
        : {}),
    };

    if (
      this.authHandoffService.shouldIssueForLogin(
        req.headers.host,
        result.user.organizationSubdomain,
        result.user.role,
      )
    ) {
      const { code } = await this.authHandoffService.issue(
        result.refreshSessionId,
        result.user.organizationSubdomain!,
      );
      response.handoff = code;
    }

    return response;
  }

  @Post('superadmin/bootstrap')
  @ApiOperation({ summary: 'Create first default SUPER_ADMIN if none exists' })
  @ApiHeader({
    name: 'x-bootstrap-admin-key',
    required: true,
    description: 'Bootstrap key required for first SUPER_ADMIN provisioning',
  })
  @ApiBody({ type: BootstrapSuperAdminDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 403, description: 'Invalid bootstrap key' })
  @ApiResponse({ status: 409, description: 'SUPER_ADMIN already exists' })
  async bootstrapSuperAdmin(
    @Body() dto: BootstrapSuperAdminDto,
    @Headers('x-bootstrap-admin-key') bootstrapAdminKey: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.bootstrapSuperAdmin(
      dto,
      bootstrapAdminKey,
    );
    this.authCookieService.attachAuthCookies(
      res,
      result.accessToken,
      result.refreshPlain,
      result.absoluteExpiresAt,
    );
    return { user: result.user };
  }
}
