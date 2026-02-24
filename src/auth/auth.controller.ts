import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @ApiResponse({ status: 409, description: 'User already exists in organization' })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Headers('x-bootstrap-admin-key') bootstrapAdminKey?: string,
  ) {
    return this.authService.register(dto, req, bootstrapAdminKey);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with tenant-scoped credentials' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'User inactive' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req);
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
  bootstrapSuperAdmin(
    @Body() dto: BootstrapSuperAdminDto,
    @Headers('x-bootstrap-admin-key') bootstrapAdminKey: string,
  ) {
    return this.authService.bootstrapSuperAdmin(dto, bootstrapAdminKey);
  }
}
