import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssHomeService } from './ess-home.service';

@ApiTags('ESS Home')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('ess/home')
export class EssHomeController {
  constructor(private readonly homeService: EssHomeService) {}

  @Get()
  @RequireAnyPermission('dashboard.ess:read', 'ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')
  @ApiOperation({ summary: 'Employee home dashboard aggregate' })
  getHome(@Req() req: TenantRequest) {
    return this.homeService.getHome(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }
}
