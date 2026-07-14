import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { PerformanceMasterService } from './performance-master.service';
import { UpdatePerformanceMasterDto } from './dto/update-performance-master.dto';

@ApiTags('Settings Performance')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('settings/performance')
export class PerformanceMasterController {
  constructor(private readonly masterService: PerformanceMasterService) {}

  @Get('master')
  @RequirePermissions('settings.performance:read')
  @ApiOperation({ summary: 'Get org performance assessment master (auto-seeds defaults)' })
  getMaster(@Req() req: TenantRequest) {
    return this.masterService.getMaster(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Put('master')
  @RequirePermissions('settings.performance:write')
  @ApiOperation({ summary: 'Bulk-replace org performance assessment master' })
  replaceMaster(
    @Req() req: TenantRequest,
    @Body() dto: UpdatePerformanceMasterDto,
  ) {
    return this.masterService.replaceMaster(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
  }
}
