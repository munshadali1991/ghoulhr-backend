import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { HrDashboardService } from './hr-dashboard.service';

@ApiTags('HR Dashboard')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('dashboard/hr')
export class HrDashboardController {
  constructor(private readonly dashboardService: HrDashboardService) {}

  @Get()
  @RequirePermissions('dashboard.hr:read')
  @ApiOperation({ summary: 'Organization admin dashboard aggregate' })
  getDashboard(@Req() req: TenantRequest) {
    return this.dashboardService.getDashboard(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      req,
    );
  }
}
