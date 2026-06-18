import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { GetLeaveBalancesQueryDto } from './dto/get-leave-balances-query.dto';
import { GetLeaveRequestsQueryDto } from './dto/get-leave-requests-query.dto';
import { PreviewLeaveDaysQueryDto } from './dto/preview-leave-days-query.dto';
import { SearchColleaguesQueryDto } from './dto/search-colleagues-query.dto';
import { EssLeaveService } from './ess-leave.service';

@ApiTags('ESS Leave')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('ess/leave')
export class EssLeaveController {
  constructor(private readonly essLeaveService: EssLeaveService) {}

  @Get('balances')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Get employee leave balances and HR policy rules' })
  getBalances(
    @Req() req: TenantRequest,
    @Query() query: GetLeaveBalancesQueryDto,
  ) {
    return this.essLeaveService.getBalances(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query.year,
    );
  }

  @Get('balances/:leaveConfigurationId')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({
    summary:
      'Get leave balance detail: summary KPIs, monthly chart, and transaction ledger',
  })
  getBalanceDetail(
    @Req() req: TenantRequest,
    @Param('leaveConfigurationId', ParseUUIDPipe) leaveConfigurationId: string,
    @Query() query: GetLeaveBalancesQueryDto,
  ) {
    return this.essLeaveService.getBalanceDetail(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      leaveConfigurationId,
      query.year,
    );
  }

  @Get('preview-days')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Preview leave days and balance impact for apply form' })
  previewDays(
    @Req() req: TenantRequest,
    @Query() query: PreviewLeaveDaysQueryDto,
  ) {
    return this.essLeaveService.previewLeaveDays(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query,
    );
  }

  @Get('types')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Get bookable leave types and approvers for the employee' })
  getLeaveTypes(@Req() req: TenantRequest) {
    return this.essLeaveService.getLeaveTypes(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('colleagues')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'Search active colleagues for leave Cc notifications' })
  searchColleagues(
    @Req() req: TenantRequest,
    @Query() query: SearchColleaguesQueryDto,
  ) {
    return this.essLeaveService.searchColleagues(
      req.tenantDataSource!,
      req.user!.sub,
      query,
    );
  }

  @Get('requests')
  @RequirePermissions('ess.leave:read')
  @ApiOperation({ summary: 'List own leave requests by status (pending or history)' })
  listRequests(
    @Req() req: TenantRequest,
    @Query() query: GetLeaveRequestsQueryDto,
  ) {
    return this.essLeaveService.listRequests(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query.status,
    );
  }

  @Post('requests')
  @RequirePermissions('ess.leave:apply')
  @ApiOperation({ summary: 'Submit a leave request with policy validation' })
  createRequest(
    @Req() req: TenantRequest,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.essLeaveService.createRequest(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto,
    );
  }

  @Post('requests/:id/withdraw')
  @RequirePermissions('ess.leave:apply')
  @ApiOperation({ summary: 'Withdraw a pending leave request' })
  withdrawRequest(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.essLeaveService.withdrawRequest(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }
}
