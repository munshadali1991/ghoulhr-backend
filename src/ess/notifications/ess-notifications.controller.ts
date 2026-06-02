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
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssNotificationsService } from './ess-notifications.service';

@ApiTags('ESS Notifications')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard)
@Controller('ess/notifications')
export class EssNotificationsController {
  constructor(
    private readonly essNotificationsService: EssNotificationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the signed-in employee' })
  list(@Req() req: TenantRequest) {
    return this.essNotificationsService.list(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread notification count for header badge' })
  unreadCount(@Req() req: TenantRequest) {
    return this.essNotificationsService.getUnreadCount(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Req() req: TenantRequest) {
    return this.essNotificationsService.markAllRead(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Patch(':id/read')
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
