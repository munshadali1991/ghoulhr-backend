import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { ReportingManagersService } from './reporting-managers.service';
import { AssignReportingManagerDto } from './dto/assign-reporting-manager.dto';
import { ListReportingManagersQueryDto } from './dto/list-reporting-managers-query.dto';
import {
  CreateEmployeeDto,
  CreateEmployeeResponseDto,
  ResetPasswordResponseDto,
} from './dto/create-employee.dto';
import {
  CheckEmployeeDuplicateDto,
  EmployeeOnboardingCreateDto,
} from './dto/employee-onboarding.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AuthorizationService } from '../rbac/authorization.service';
import { EmployeeScopeService } from '../rbac/employee-scope.service';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class EmployeesController {
  private readonly logger = new Logger(EmployeesController.name);

  constructor(
    private readonly employeesService: EmployeesService,
    private readonly reportingManagersService: ReportingManagersService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
  ) {}

  @Get()
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Get all employees in current tenant' })
  async findAll(@Req() req: TenantRequest) {
    this.logger.log(
      `Fetching all employees for tenant: ${req.organization?.subdomain}`,
    );
    const auth = await this.authorizationService.resolveCached(req, {
      employeeId: req.user!.sub,
      organizationId: req.organization!.id,
      tenantDataSource: req.tenantDataSource!,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      req.tenantDataSource!,
      req.user!.sub,
      'employees:read',
      auth,
    );
    return this.employeesService.findAll(req.tenantDataSource!, visibleIds);
  }

  @Post('check-duplicate')
  @RequirePermissions('employees:onboard')
  @ApiOperation({ summary: 'Check duplicate email / phone before onboarding' })
  async checkDuplicate(
    @Req() req: TenantRequest,
    @Body() dto: CheckEmployeeDuplicateDto,
  ) {
    return this.employeesService.checkDuplicates(dto, req.tenantDataSource);
  }

  @Post('hr-onboarding')
  @RequirePermissions('employees:onboard')
  @ApiOperation({ summary: 'Enterprise HR onboarding (modular persistence)' })
  async hrOnboarding(
    @Req() req: TenantRequest,
    @Body() dto: EmployeeOnboardingCreateDto,
  ): Promise<CreateEmployeeResponseDto> {
    const actorSub = req.user?.sub?.trim();
    if (!actorSub) {
      throw new UnauthorizedException(
        'Access token is missing subject (sub). Sign in again.',
      );
    }
    const result = await this.employeesService.createHrOnboarding(
      dto,
      req.tenantDataSource,
      actorSub,
      req.organization?.id,
    );
    return {
      employee: {
        id: result.employee.id,
        employeeCode: result.employee.employeeCode,
        name: result.employee.name,
        email: result.employee.email,
        role: result.employee.role,
        departmentName: result.departmentName,
        designationName: result.designationName,
        departmentId: result.employee.departmentId,
        designationId: result.employee.designationId,
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

  @Patch(':id/hr-onboarding')
  @RequirePermissions('employees:onboard')
  @ApiOperation({ summary: 'Update employee via modular HR onboarding payload' })
  async updateHrOnboarding(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: EmployeeOnboardingCreateDto,
  ) {
    const actorSub = req.user?.sub?.trim();
    if (!actorSub) {
      throw new UnauthorizedException(
        'Access token is missing subject (sub). Sign in again.',
      );
    }
    return this.employeesService.updateHrOnboarding(
      id,
      dto,
      req.tenantDataSource,
      actorSub,
      req.organization?.id,
    );
  }

  @Get('reporting-managers')
  @RequirePermissions('employees:reporting-manager:read')
  @ApiOperation({ summary: 'List employees with active reporting manager assignments' })
  async listReportingManagers(
    @Req() req: TenantRequest,
    @Query() query: ListReportingManagersQueryDto,
  ) {
    return this.reportingManagersService.listAssignments(
      req.tenantDataSource,
      query,
    );
  }

  @Get('reporting-manager-candidates')
  @RequirePermissions('employees:reporting-manager:read')
  @ApiOperation({
    summary: 'List employees eligible to be assigned as reporting managers',
  })
  async listReportingManagerCandidates(@Req() req: TenantRequest) {
    const auth = await this.authorizationService.resolveCached(req, {
      employeeId: req.user!.sub,
      organizationId: req.organization!.id,
      tenantDataSource: req.tenantDataSource!,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      req.tenantDataSource!,
      req.user!.sub,
      'employees:read',
      auth,
    );
    return this.reportingManagersService.listManagerCandidates(
      req.tenantDataSource!,
      visibleIds,
    );
  }

  @Get(':id/reporting-manager')
  @RequirePermissions('employees:reporting-manager:read')
  @ApiOperation({ summary: 'Get active reporting manager for an employee' })
  async getReportingManager(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    return this.reportingManagersService.getAssignmentForEmployee(
      req.tenantDataSource,
      id,
    );
  }

  @Post(':id/reporting-manager')
  @RequirePermissions('employees:reporting-manager:assign')
  @ApiOperation({ summary: 'Assign or change primary reporting manager' })
  async assignReportingManager(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: AssignReportingManagerDto,
  ) {
    return this.reportingManagersService.assignOrChange(
      req.tenantDataSource,
      id,
      dto,
    );
  }

  @Delete(':id/reporting-manager')
  @RequirePermissions('employees:reporting-manager:assign')
  @ApiOperation({ summary: 'Remove active reporting manager assignment' })
  async removeReportingManager(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    await this.reportingManagersService.remove(req.tenantDataSource, id);
    return { message: 'Reporting manager removed' };
  }

  @Get(':id')
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Get employee by ID' })
  async findById(@Req() req: TenantRequest, @Param('id') id: string) {
    this.logger.log(
      `Fetching employee ${id} for tenant: ${req.organization?.subdomain}`,
    );
    const auth = await this.authorizationService.resolveCached(req, {
      employeeId: req.user!.sub,
      organizationId: req.organization!.id,
      tenantDataSource: req.tenantDataSource!,
    });
    const visibleIds = await this.employeeScopeService.getVisibleEmployeeIds(
      req.tenantDataSource!,
      req.user!.sub,
      'employees:read',
      auth,
    );
    if (visibleIds && !visibleIds.includes(id)) {
      return { message: 'Employee not found' };
    }
    const employee = await this.employeesService.findById(
      id,
      req.tenantDataSource,
    );
    if (!employee) {
      return { message: 'Employee not found' };
    }
    return employee;
  }

  @Post()
  @RequirePermissions('employees:create')
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
      req.tenantDataSource,
      req.user?.sub || '',
      req.organization?.id,
    );

    return {
      employee: {
        id: result.employee.id,
        employeeCode: result.employee.employeeCode,
        name: result.employee.name,
        email: result.employee.email,
        role: result.employee.role,
        departmentName: result.departmentName,
        designationName: result.designationName,
        departmentId: result.employee.departmentId,
        designationId: result.employee.designationId,
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
  @RequirePermissions('employees:reset-password')
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
      req.tenantDataSource,
    );

    return {
      temporaryPassword: result.temporaryPassword,
      expiresAt: result.expiresAt,
      message: 'Password reset successfully. Share new credentials securely.',
    };
  }

  @Patch(':id')
  @RequirePermissions('employees:update')
  @ApiOperation({ summary: 'Update employee details (admin only)' })
  async updateEmployee(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    this.logger.log(
      `Updating employee ${id} for tenant: ${req.organization?.subdomain}`,
    );
    return this.employeesService.updateEmployee(
      id,
      dto,
      req.tenantDataSource,
      req.user?.sub || '',
      req.organization?.id,
    );
  }
}
