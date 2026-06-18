import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssNotificationsService } from './ess-notifications.service';

@ApiTags('ESS Notifications')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('ess/notifications')
export class EssNotificationsController {
  constructor(
    private readonly essNotificationsService: EssNotificationsService,
  ) {}

  @Get()
  @RequireAnyPermission('ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')
  @ApiOperation({ summary: 'List notifications for the signed-in employee' })
  list(@Req() req: TenantRequest) {
    return this.essNotificationsService.list(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('unread-count')
  @RequireAnyPermission('ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')
  @ApiOperation({ summary: 'Unread notification count for header badge' })
  unreadCount(@Req() req: TenantRequest) {
    return this.essNotificationsService.getUnreadCount(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Patch('read-all')
  @RequireAnyPermission('ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Req() req: TenantRequest) {
    return this.essNotificationsService.markAllRead(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Patch(':id/read')
  @RequireAnyPermission('ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.essNotificationsService.markRead(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }
}
