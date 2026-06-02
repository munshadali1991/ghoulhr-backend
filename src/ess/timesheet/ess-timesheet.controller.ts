import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssTimesheetService } from './ess-timesheet.service';
import { UpsertTimesheetDayDto } from './dto/upsert-timesheet-day.dto';
import { TimesheetReportQueryDto } from './dto/timesheet-report-query.dto';

@ApiTags('ESS Timesheet')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard)
@Controller('ess/timesheet')
export class EssTimesheetController {
  constructor(private readonly timesheetService: EssTimesheetService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get timesheet rules for the employee (read-only)' })
  getSettings(@Req() req: TenantRequest) {
    return this.timesheetService.getSettings(req.tenantDataSource!);
  }

  @Get('days/:date')
  @ApiOperation({ summary: 'Get timesheet for a specific date' })
  getDay(@Req() req: TenantRequest, @Param('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.timesheetService.getDay(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      date,
    );
  }

  @Post('days/:date/reopen')
  @ApiOperation({
    summary: 'Reopen a submitted timesheet for editing (reverts to draft)',
  })
  reopenDay(@Req() req: TenantRequest, @Param('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.timesheetService.reopenDay(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      date,
    );
  }

  @Put('days/:date')
  @ApiOperation({ summary: 'Save or submit timesheet for a date' })
  upsertDay(
    @Req() req: TenantRequest,
    @Param('date') date: string,
    @Body() dto: UpsertTimesheetDayDto,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.timesheetService.upsertDay(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      date,
      dto,
    );
  }

  @Get('reports')
  @ApiOperation({ summary: 'Timesheet reports (daily / weekly / monthly)' })
  getReports(@Req() req: TenantRequest, @Query() query: TimesheetReportQueryDto) {
    return this.timesheetService.getReports(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query,
    );
  }
}
