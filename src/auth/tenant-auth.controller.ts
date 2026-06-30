import { Body, Controller, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { TenantAuthService } from './tenant-auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from '../employees/dto/create-employee.dto';
import { TenantAuthGuard } from './guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { AuthCookieService } from './auth-cookie.service';
import { AuthHandoffService } from './auth-handoff.service';

@ApiTags('Tenant Auth')
@Controller('auth')
export class TenantAuthController {
  constructor(
    private readonly tenantAuthService: TenantAuthService,
    private readonly authCookieService: AuthCookieService,
    private readonly authHandoffService: AuthHandoffService,
  ) {}

  @Post('employee/login')
  @ApiOperation({ summary: 'Tenant employee login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account inactive or locked' })
  async employeeLogin(
    @Body() dto: LoginDto,
    @Req() req: TenantRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tenantAuthService.login(
      dto,
      req.tenantDataSource,
      req.organization,
    );
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

  @Post('change-password')
  @UseGuards(TenantAuthGuard, SubscriptionGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change employee password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'New password does not meet requirements',
  })
  @ApiResponse({ status: 401, description: 'Current password incorrect' })
  async changePassword(
    @Req() req: TenantRequest & Request,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.organization?.id || !req.tenantDataSource || !req.user) {
      throw new UnauthorizedException('Not authenticated');
    }

    const result = await this.tenantAuthService.changePassword(
      req.user.sub,
      dto,
      req.tenantDataSource,
      {
        id: req.organization.id,
        name: req.organization.name,
        subdomain: req.organization.subdomain,
      },
      req.user,
    );

    const refreshPlain = req.cookies?.[this.authCookieService.getRefreshCookieName()];
    if (refreshPlain) {
      this.authCookieService.attachAuthCookies(
        res,
        result.accessToken,
        refreshPlain,
        result.absoluteExpiresAt,
      );
    }

    return {
      message: result.message,
      mustChangePassword: result.mustChangePassword,
      user: result.user,
    };
  }
}
