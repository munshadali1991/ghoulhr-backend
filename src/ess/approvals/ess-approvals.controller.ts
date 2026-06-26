import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssLeaveService } from '../leave/ess-leave.service';
import { EssTimesheetService } from '../timesheet/ess-timesheet.service';
import { RejectApprovalDto } from './dto/reject-approval.dto';
import { ApproveApprovalDto } from './dto/approve-approval.dto';

@ApiTags('ESS Approvals')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('ess/approvals')
export class EssApprovalsController {
  constructor(
    private readonly essLeaveService: EssLeaveService,
    private readonly essTimesheetService: EssTimesheetService,
  ) {}

  @Get('leave')
  @RequirePermissions('approvals.leave:read')
  @ApiOperation({ summary: 'List leave requests pending approval for the current user' })
  listLeaveApprovals(@Req() req: TenantRequest) {
    return this.essLeaveService.listPendingApprovals(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('leave/:id')
  @RequirePermissions('approvals.leave:read')
  @ApiOperation({ summary: 'Get leave approval detail for manager review' })
  getLeaveApprovalDetail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.essLeaveService.getLeaveApprovalDetail(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Get('leave/:id/document')
  @RequirePermissions('approvals.leave:read')
  @ApiOperation({ summary: 'Download supporting document for a leave request' })
  getLeaveApprovalDocument(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.essLeaveService.getLeaveApprovalDocument(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Post('leave/:id/approve')
  @RequirePermissions('approvals.leave:act')
  @ApiOperation({ summary: 'Approve a pending leave request' })
  approveLeave(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveApprovalDto,
  ) {
    return this.essLeaveService.approveLeaveRequest(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.notes,
    );
  }

  @Post('leave/:id/reject')
  @RequirePermissions('approvals.leave:act')
  @ApiOperation({ summary: 'Reject a pending leave request' })
  rejectLeave(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.essLeaveService.rejectLeaveRequest(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }

  @Get('timesheet')
  @RequirePermissions('approvals.timesheet:read')
  @ApiOperation({ summary: 'List submitted timesheets pending approval' })
  listTimesheetApprovals(@Req() req: TenantRequest) {
    return this.essTimesheetService.listPendingApprovals(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Post('timesheet/:id/approve')
  @RequirePermissions('approvals.timesheet:act')
  @ApiOperation({ summary: 'Approve a submitted timesheet day' })
  approveTimesheet(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.essTimesheetService.approveTimesheetDay(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Post('timesheet/:id/reject')
  @RequirePermissions('approvals.timesheet:act')
  @ApiOperation({ summary: 'Reject a submitted timesheet day' })
  rejectTimesheet(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.essTimesheetService.rejectTimesheetDay(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }
}
