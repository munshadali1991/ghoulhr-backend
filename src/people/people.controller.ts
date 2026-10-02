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
import { ListPeopleQueryDto } from './dto/list-people-query.dto';
import { PeopleService } from './people.service';

@ApiTags('People')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('people')
export class PeopleController {
  constructor(
    private readonly peopleService: PeopleService,
    private readonly authorizationService: AuthorizationService,
    private readonly employeeScopeService: EmployeeScopeService,
  ) {}

  @Get()
  @RequirePermissions('employees:read')
  @ApiOperation({
    summary: 'Directory list — Everyone (RBAC scope) or My Team (direct reports)',
  })
  async list(@Req() req: TenantRequest, @Query() query: ListPeopleQueryDto) {
    const visibleIds = await this.visibleIds(req);
    return this.peopleService.listPeople(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      visibleIds,
      query,
    );
  }

  @Get('filter-options')
  @RequirePermissions('employees:read')
  @ApiOperation({
    summary: 'Department and designation options for People directory filters',
  })
  async filterOptions(@Req() req: TenantRequest) {
    return this.peopleService.getFilterOptions(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get(':id')
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Read-only people directory profile' })
  async getProfile(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const visibleIds = await this.visibleIds(req);
    return this.peopleService.getPersonProfile(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
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
      'employees:read',
      auth,
    );
  }
}
