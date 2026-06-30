import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import {
  CreateCalendarHolidayDto,
  GetOrganizationCalendarQueryDto,
  PublishOrganizationCalendarDto,
  UpdateCalendarHolidayDto,
} from './dto/organization-calendar.dto';
import { OrganizationCalendarService } from './organization-calendar.service';

@ApiTags('Settings — Organization Calendar')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('settings/organization/calendar')
export class OrganizationCalendarController {
  constructor(
    private readonly organizationCalendarService: OrganizationCalendarService,
  ) {}

  @Get()
  @RequirePermissions('settings.organization:read')
  @ApiOperation({ summary: 'Get organization calendar and holidays for a year' })
  getCalendar(
    @Req() req: TenantRequest,
    @Query() query: GetOrganizationCalendarQueryDto,
  ) {
    return this.organizationCalendarService.getCalendarForYear(
      req.tenantDataSource!,
      req.organization!.id,
      query.year,
    );
  }

  @Post('holidays')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({ summary: 'Add a holiday to the organization calendar' })
  createHoliday(
    @Req() req: TenantRequest,
    @Body() dto: CreateCalendarHolidayDto,
  ) {
    return this.organizationCalendarService.createHoliday(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
  }

  @Patch('holidays/:id')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({ summary: 'Update a calendar holiday' })
  updateHoliday(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarHolidayDto,
  ) {
    return this.organizationCalendarService.updateHoliday(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
  }

  @Delete('holidays/:id')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({ summary: 'Delete a calendar holiday' })
  deleteHoliday(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.organizationCalendarService.deleteHoliday(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
  }

  @Post('publish')
  @RequirePermissions('settings.organization:write')
  @ApiOperation({ summary: 'Publish the organization calendar for a year' })
  publish(
    @Req() req: TenantRequest,
    @Body() dto: PublishOrganizationCalendarDto,
  ) {
    return this.organizationCalendarService.publishCalendar(
      req.tenantDataSource!,
      req.organization!.id,
      dto.year,
    );
  }
}
