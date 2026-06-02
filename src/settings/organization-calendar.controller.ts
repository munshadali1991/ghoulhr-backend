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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { EmployeeRole } from '../employees/employee.entity';
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
@UseGuards(TenantAuthGuard, RolesGuard)
@Controller('settings/organization/calendar')
export class OrganizationCalendarController {
  constructor(
    private readonly organizationCalendarService: OrganizationCalendarService,
  ) {}

  @Get()
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
  @Roles(EmployeeRole.ORG_ADMIN)
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
  @Roles(EmployeeRole.ORG_ADMIN)
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
  @Roles(EmployeeRole.ORG_ADMIN)
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
  @Roles(EmployeeRole.ORG_ADMIN)
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
