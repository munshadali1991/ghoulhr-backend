import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { GetYearQueryDto } from '../dto/get-year-query.dto';
import { EssHolidaysService } from './ess-holidays.service';

@ApiTags('ESS Holidays')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/holidays')
export class EssHolidaysController {
  constructor(private readonly holidaysService: EssHolidaysService) {}

  @Get()
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Holiday calendar by year (month grid)' })
  getCalendar(@Req() req: TenantRequest, @Query() query: GetYearQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    return this.holidaysService.getHolidayCalendar(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      year,
    );
  }
}
