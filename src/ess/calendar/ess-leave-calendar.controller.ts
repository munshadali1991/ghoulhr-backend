import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { GetLeaveCalendarQueryDto } from '../dto/get-leave-calendar-query.dto';
import { GetLeaveTransactionsQueryDto } from '../dto/get-leave-transactions-query.dto';
import { GetTeamOnLeaveChartQueryDto } from './dto/get-team-on-leave-chart-query.dto';
import { EssLeaveCalendarService } from './ess-leave-calendar.service';

@ApiTags('ESS Leave Calendar')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/leave')
export class EssLeaveCalendarController {
  constructor(private readonly calendarService: EssLeaveCalendarService) {}

  @Get('calendar')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Leave calendar markers for a month' })
  getCalendar(
    @Req() req: TenantRequest,
    @Query() query: GetLeaveCalendarQueryDto,
  ) {
    const filter = query.filter ?? 'me';
    return this.calendarService.getCalendar(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query.year,
      query.month,
      filter,
    );
  }

  @Get('transactions')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Leave transactions for a selected date' })
  getTransactions(
    @Req() req: TenantRequest,
    @Query() query: GetLeaveTransactionsQueryDto,
  ) {
    return this.calendarService.getTransactions(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query.date,
      query.filter ?? 'me',
      query.search,
    );
  }

  @Get('team-on-leave')
  @RequirePermissions('dashboard.ess.team-on-leave:read')
  @ApiOperation({
    summary:
      'Team On Leave home widget: APPROVED leave for people in access scope',
  })
  getTeamOnLeave(@Req() req: TenantRequest) {
    return this.calendarService.getTeamOnLeave(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('team-on-leave/chart')
  @RequirePermissions('dashboard.ess.team-on-leave:read')
  @ApiOperation({
    summary: 'Team On Leave chart series and day breakdown for a date range',
  })
  getTeamOnLeaveChart(
    @Req() req: TenantRequest,
    @Query() query: GetTeamOnLeaveChartQueryDto,
  ) {
    return this.calendarService.getTeamOnLeaveChart(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      {
        from: query.from,
        to: query.to,
        type: query.type,
      },
    );
  }

  @Get('team-on-leave/chart/export')
  @RequirePermissions('dashboard.ess.team-on-leave:read')
  @ApiOperation({ summary: 'Export Team On Leave chart rows as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTeamOnLeaveChart(
    @Req() req: TenantRequest,
    @Query() query: GetTeamOnLeaveChartQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } =
      await this.calendarService.exportTeamOnLeaveChartCsv(
        req.tenantDataSource!,
        req.organization!.id,
        req.user!.sub,
        {
          from: query.from,
          to: query.to,
          type: query.type,
        },
      );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }
}
