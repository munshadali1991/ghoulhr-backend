import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, CreateEmployeeResponseDto, ResetPasswordResponseDto } from './dto/create-employee.dto';
import {
  CheckEmployeeDuplicateDto,
  EmployeeOnboardingCreateDto,
} from './dto/employee-onboarding.dto';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { EmployeeRole } from './employee.entity';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(TenantAuthGuard, RolesGuard)
export class EmployeesController {
  private readonly logger = new Logger(EmployeesController.name);

  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(EmployeeRole.ORG_ADMIN, EmployeeRole.MANAGER)
  @ApiOperation({ summary: 'Get all employees in current tenant' })
  async findAll(@Req() req: TenantRequest) {
    this.logger.log(
      `Fetching all employees for tenant: ${req.organization?.subdomain}`,
    );
    return this.employeesService.findAll(req.tenantDataSource!);
  }

  @Post('check-duplicate')
  @Roles(EmployeeRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Check duplicate email / phone before onboarding' })
  async checkDuplicate(@Req() req: TenantRequest, @Body() dto: CheckEmployeeDuplicateDto) {
    return this.employeesService.checkDuplicates(dto, req.tenantDataSource!);
  }

  @Post('hr-onboarding')
  @Roles(EmployeeRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Enterprise HR onboarding (modular persistence)' })
  async hrOnboarding(
    @Req() req: TenantRequest,
    @Body() dto: EmployeeOnboardingCreateDto,
  ): Promise<CreateEmployeeResponseDto> {
    const actorSub = req.user?.sub?.trim();
    if (!actorSub) {
      throw new UnauthorizedException('Access token is missing subject (sub). Sign in again.');
    }
    const result = await this.employeesService.createHrOnboarding(
      dto,
      req.tenantDataSource!,
      actorSub,
    );
    return {
      employee: {
        id: result.employee.id,
        employeeCode: result.employee.employeeCode,
        name: result.employee.name,
        email: result.employee.email,
        role: result.employee.role,
        department: result.employee.department,
        designation: result.employee.designation,
        status: result.employee.status,
        dateOfJoining: result.employee.dateOfJoining,
        createdAt: result.employee.createdAt,
      },
      credentials: {
        temporaryPassword: result.temporaryPassword,
        expiresAt: result.passwordExpiresAt,
        mustChangeOnFirstLogin: true,
      },
      message: 'Employee created successfully. Share credentials securely.',
    };
  }

  @Get(':id')
  @Roles(EmployeeRole.ORG_ADMIN, EmployeeRole.MANAGER)
  @ApiOperation({ summary: 'Get employee by ID' })
  async findById(@Req() req: TenantRequest, @Param('id') id: string) {
    this.logger.log(
      `Fetching employee ${id} for tenant: ${req.organization?.subdomain}`,
    );
    const employee = await this.employeesService.findById(
      id,
      req.tenantDataSource!,
    );
    if (!employee) {
      return { message: 'Employee not found' };
    }
    return employee;
  }

  @Post()
  @Roles(EmployeeRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Create new employee in current tenant' })
  async create(
    @Req() req: TenantRequest,
    @Body() dto: CreateEmployeeDto,
  ): Promise<CreateEmployeeResponseDto> {
    this.logger.log(
      `Creating employee for tenant: ${req.organization?.subdomain}`,
    );

    const result = await this.employeesService.create(
      dto,
      req.tenantDataSource!,
      req.user?.sub || '', // createdBy employee ID
    );

    return {
      employee: {
        id: result.employee.id,
        employeeCode: result.employee.employeeCode,
        name: result.employee.name,
        email: result.employee.email,
        role: result.employee.role,
        department: result.employee.department,
        designation: result.employee.designation,
        status: result.employee.status,
        dateOfJoining: result.employee.dateOfJoining,
        createdAt: result.employee.createdAt,
      },
      credentials: {
        temporaryPassword: result.temporaryPassword,
        expiresAt: result.passwordExpiresAt,
        mustChangeOnFirstLogin: true,
      },
      message: 'Employee created successfully. Share credentials securely.',
    };
  }

  @Post(':id/reset-password')
  @Roles(EmployeeRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Reset employee password (admin only)' })
  async resetPassword(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ): Promise<ResetPasswordResponseDto> {
    this.logger.log(
      `Resetting password for employee ${id} by admin ${req.user?.sub}`,
    );

    const result = await this.employeesService.resetPassword(
      id,
      req.tenantDataSource!,
    );

    return {
      temporaryPassword: result.temporaryPassword,
      expiresAt: result.expiresAt,
      message: 'Password reset successfully. Share new credentials securely.',
    };
  }
}
