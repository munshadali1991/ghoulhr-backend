import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { AuthCookieService } from './auth-cookie.service';

@ApiTags('Tenant Auth')
@Controller('auth')
export class TenantAuthController {
  constructor(
    private readonly tenantAuthService: TenantAuthService,
    private readonly authCookieService: AuthCookieService,
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
    );
    return {
      user: result.user,
      ...(result.requiresPasswordChange
        ? { requiresPasswordChange: true }
        : {}),
    };
  }

  @Post('change-password')
  @UseGuards(TenantAuthGuard)
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
    @Req() req: TenantRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.tenantAuthService.changePassword(
      req.user?.sub || '',
      dto,
      req.tenantDataSource,
    );
  }
}
