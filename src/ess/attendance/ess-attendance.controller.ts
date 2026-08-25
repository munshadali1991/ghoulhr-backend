import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
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
import { GetYearMonthQueryDto } from '../dto/get-year-month-query.dto';
import { EssAttendanceService } from './ess-attendance.service';
import { SignInPunchDto, SignPunchDto } from './dto/sign-punch.dto';
import { GetWhoIsInQueryDto } from './dto/get-who-is-in-query.dto';
import { GetEmployeeSwipesQueryDto } from './dto/get-employee-swipes-query.dto';

@ApiTags('ESS Attendance')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/attendance')
export class EssAttendanceController {
  constructor(private readonly attendanceService: EssAttendanceService) {}

  @Post('sign-in')
  @RequirePermissions('ess.attendance:punch')
  @ApiOperation({ summary: 'Employee sign in (punch IN)' })
  signIn(@Req() req: TenantRequest, @Body() dto: SignInPunchDto) {
    return this.attendanceService.signIn(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto.latitude,
      dto.longitude,
      this.resolveClientIp(req),
      dto.signInLocation,
    );
  }

  @Post('sign-out')
  @RequirePermissions('ess.attendance:punch')
  @ApiOperation({ summary: 'Employee sign out (punch OUT)' })
  signOut(@Req() req: TenantRequest, @Body() dto: SignPunchDto) {
    return this.attendanceService.signOut(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto.latitude,
      dto.longitude,
      this.resolveClientIp(req),
    );
  }

  private resolveClientIp(req: TenantRequest): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return String(forwarded[0]).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || null;
  }

  @Get('today')
  @RequirePermissions('ess.attendance:read')
  @ApiOperation({ summary: 'Today attendance status for home widget' })
  getToday(@Req() req: TenantRequest) {
    return this.attendanceService.getTodayStatus(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('summary')
  @RequirePermissions('ess.attendance:read')
  @ApiOperation({ summary: 'Monthly attendance metrics' })
  getSummary(@Req() req: TenantRequest, @Query() query: GetYearMonthQueryDto) {
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return this.attendanceService.getSummary(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      year,
      month,
    );
  }

  @Get('days')
  @RequirePermissions('ess.attendance:read')
  @ApiOperation({ summary: 'Monthly attendance calendar markers' })
  getDays(@Req() req: TenantRequest, @Query() query: GetYearMonthQueryDto) {
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return this.attendanceService.getDays(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      year,
      month,
    );
  }

  @Get('swipes')
  @RequirePermissions('ess.attendance.swipes:read')
  @ApiOperation({ summary: 'Employee swipe history for people in access scope' })
  getSwipes(@Req() req: TenantRequest, @Query() query: GetEmployeeSwipesQueryDto) {
    return this.attendanceService.getEmployeeSwipes(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      {
        from: query.from,
        to: query.to,
        q: query.q,
        punchType: query.punchType,
        page: query.page,
        pageSize: query.pageSize,
      },
    );
  }

  @Get('swipes/export')
  @RequirePermissions('ess.attendance.swipes:read')
  @ApiOperation({ summary: 'Export employee swipe history as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportSwipes(
    @Req() req: TenantRequest,
    @Query() query: GetEmployeeSwipesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.attendanceService.exportEmployeeSwipesCsv(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      {
        from: query.from,
        to: query.to,
        q: query.q,
        punchType: query.punchType,
      },
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get('who-is-in')
  @RequirePermissions('dashboard.ess.who-is-in:read')
  @ApiOperation({
    summary:
      'Who is in roster for a work date (not yet in / late / on time / out of office)',
  })
  getWhoIsIn(@Req() req: TenantRequest, @Query() query: GetWhoIsInQueryDto) {
    return this.attendanceService.getWhoIsIn(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query.date,
    );
  }

  @Get('days/:date')
  @RequirePermissions('ess.attendance:read')
  @ApiOperation({ summary: 'Attendance detail for a specific date' })
  getDayDetail(@Req() req: TenantRequest, @Param('date') date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.attendanceService.getDayDetail(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      date,
    );
  }
}
