import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AuthorizationService } from '../rbac/authorization.service';
import { EmployeeScopeService } from '../rbac/employee-scope.service';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { HrSkillsService } from './hr-skills.service';
import { SearchHrSkillsQueryDto } from './dto/hr-skills-search.dto';

@ApiTags('HR Skills')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('hr/skills')
export class HrSkillsController {
  constructor(
    private readonly hrSkillsService: HrSkillsService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
  ) {}

  @Get('catalog')
  @RequirePermissions('employees.skills:read')
  @ApiOperation({ summary: 'Active skill catalog for HR skill search filters' })
  getCatalog(@Req() req: TenantRequest) {
    return this.hrSkillsService.getCatalog(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get('employees')
  @RequirePermissions('employees.skills:read')
  @ApiOperation({ summary: 'Search employees by name, code, and skills' })
  async searchEmployees(
    @Req() req: TenantRequest,
    @Query() query: SearchHrSkillsQueryDto,
  ) {
    const visibleIds = await this.visibleIds(req);
    return this.hrSkillsService.searchEmployees(
      req.tenantDataSource!,
      req.organization!.id,
      visibleIds,
      query,
    );
  }

  @Get('employees/:id')
  @RequirePermissions('employees.skills:read')
  @ApiOperation({ summary: 'View an employee skill profile' })
  async getEmployeeProfile(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const visibleIds = await this.visibleIds(req);
    return this.hrSkillsService.getEmployeeProfile(
      req.tenantDataSource!,
      req.organization!.id,
      visibleIds,
      id,
    );
  }

  private async visibleIds(req: TenantRequest) {
    const auth = await this.authorizationService.resolveCached(req, {
      employeeId: req.user!.sub,
      organizationId: req.organization!.id,
      tenantDataSource: req.tenantDataSource!,
    });
    return this.employeeScopeService.getVisibleEmployeeIds(
      req.tenantDataSource!,
      req.user!.sub,
      'employees.skills:read',
      auth,
    );
  }
}
