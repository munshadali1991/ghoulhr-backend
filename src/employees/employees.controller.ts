import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import type { CreateEmployeeDto } from './employees.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(TenantAuthGuard)
export class EmployeesController {
  private readonly logger = new Logger(EmployeesController.name);

  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all employees in current tenant' })
  async findAll(@Req() req: TenantRequest) {
    this.logger.log(
      `Fetching all employees for tenant: ${req.organization?.subdomain}`,
    );
    return this.employeesService.findAll(req.tenantDataSource!);
  }

  @Get(':id')
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
  @ApiOperation({ summary: 'Create new employee in current tenant' })
  async create(
    @Req() req: TenantRequest,
    @Body() dto: CreateEmployeeDto,
  ) {
    this.logger.log(
      `Creating employee for tenant: ${req.organization?.subdomain}`,
    );
    
    // Set global user ID from authenticated user
    const employee = await this.employeesService.create(
      {
        ...dto,
        globalUserId: dto.globalUserId || req.user?.sub || '',
      },
      req.tenantDataSource!,
    );
    
    return employee;
  }
}
