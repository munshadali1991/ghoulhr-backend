import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { GetYearMonthQueryDto } from '../dto/get-year-month-query.dto';
import { EssAttendanceService } from './ess-attendance.service';
import { SignPunchDto } from './dto/sign-punch.dto';

@ApiTags('ESS Attendance')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard)
@Controller('ess/attendance')
export class EssAttendanceController {
  constructor(private readonly attendanceService: EssAttendanceService) {}

  @Post('sign-in')
  @ApiOperation({ summary: 'Employee sign in (punch IN)' })
  signIn(@Req() req: TenantRequest, @Body() dto: SignPunchDto) {
    return this.attendanceService.signIn(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto.latitude,
      dto.longitude,
    );
  }

  @Post('sign-out')
  @ApiOperation({ summary: 'Employee sign out (punch OUT)' })
  signOut(@Req() req: TenantRequest, @Body() dto: SignPunchDto) {
    return this.attendanceService.signOut(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto.latitude,
      dto.longitude,
    );
  }

  @Get('today')
  @ApiOperation({ summary: 'Today attendance status for home widget' })
  getToday(@Req() req: TenantRequest) {
    return this.attendanceService.getTodayStatus(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('summary')
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

  @Get('days/:date')
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
