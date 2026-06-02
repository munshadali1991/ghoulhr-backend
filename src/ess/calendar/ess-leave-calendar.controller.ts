import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { GetLeaveCalendarQueryDto } from '../dto/get-leave-calendar-query.dto';
import { GetLeaveTransactionsQueryDto } from '../dto/get-leave-transactions-query.dto';
import { EssLeaveCalendarService } from './ess-leave-calendar.service';

@ApiTags('ESS Leave Calendar')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard)
@Controller('ess/leave')
export class EssLeaveCalendarController {
  constructor(private readonly calendarService: EssLeaveCalendarService) {}

  @Get('calendar')
  @ApiOperation({ summary: 'Leave calendar markers for a month' })
  getCalendar(
    @Req() req: TenantRequest,
    @Query() query: GetLeaveCalendarQueryDto,
  ) {
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const filter = query.filter ?? 'me';
    return this.calendarService.getCalendar(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      year,
      month,
      filter,
    );
  }

  @Get('transactions')
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
}
