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
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { ApproveApprovalDto } from '../approvals/dto/approve-approval.dto';
import { RejectApprovalDto } from '../approvals/dto/reject-approval.dto';
import { ExpenseClaimStatus } from '../entities/expense-claim.entity';
import {
  CreateExpenseClaimDto,
  CreateExpenseClaimLineDto,
  MarkExpensePaidDto,
  SendBackExpenseDto,
  UpdateExpenseClaimDto,
  UpdateExpenseClaimLineDto,
} from './dto/expense-claim.dto';
import {
  UpdateExpenseCategoriesDto,
  UpdateExpensePolicyDto,
} from '../../settings/dto/expense-settings.dto';
import { EssExpenseService } from './ess-expense.service';

@ApiTags('ESS Expense')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/expense')
export class EssExpenseController {
  constructor(private readonly expenseService: EssExpenseService) {}

  @Get('categories')
  @RequirePermissions('ess.expense:read')
  @ApiOperation({ summary: 'List active expense categories' })
  listCategories(@Req() req: TenantRequest) {
    return this.expenseService.listActiveCategories(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get('claims')
  @RequirePermissions('ess.expense:read')
  @ApiOperation({ summary: 'List own expense claims' })
  listClaims(
    @Req() req: TenantRequest,
    @Query('status') status?: ExpenseClaimStatus,
  ) {
    return this.expenseService.listOwnClaims(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      status,
    );
  }

  @Get('claims/:id')
  @RequirePermissions('ess.expense:read')
  @ApiOperation({ summary: 'Get own expense claim detail' })
  getClaim(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenseService.getOwnClaim(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Post('claims')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Create draft expense claim' })
  createClaim(@Req() req: TenantRequest, @Body() dto: CreateExpenseClaimDto) {
    return this.expenseService.createDraft(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto,
    );
  }

  @Patch('claims/:id')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Update draft or sent-back expense claim' })
  updateClaim(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseClaimDto,
  ) {
    return this.expenseService.updateDraft(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Post('claims/:id/lines')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Add expense line to draft/sent-back claim' })
  addLine(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExpenseClaimLineDto,
  ) {
    return this.expenseService.addLine(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Patch('claims/:id/lines/:lineId')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Update expense line' })
  updateLine(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateExpenseClaimLineDto,
  ) {
    return this.expenseService.updateLine(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      dto,
    );
  }

  @Delete('claims/:id/lines/:lineId')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Delete expense line' })
  deleteLine(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.deleteLine(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
    );
  }

  @Post('claims/:id/submit')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Submit expense claim for manager approval' })
  submit(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenseService.submit(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Post('claims/:id/withdraw')
  @RequirePermissions('ess.expense:apply')
  @ApiOperation({ summary: 'Withdraw or cancel expense claim' })
  withdraw(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenseService.withdraw(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Get('claims/:id/lines/:lineId/receipt/preview')
  @RequirePermissions('ess.expense:read')
  @ApiOperation({ summary: 'Preview receipt for own claim line' })
  getReceiptPreview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptPreview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'owner',
    );
  }

  @Get('claims/:id/lines/:lineId/receipt')
  @RequirePermissions('ess.expense:read')
  @ApiOperation({ summary: 'Download receipt for own claim line' })
  getReceipt(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptDownload(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'owner',
    );
  }
}

@ApiTags('ESS Expense Approvals')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/approvals/expense')
export class EssExpenseApprovalsController {
  constructor(private readonly expenseService: EssExpenseService) {}

  @Get()
  @RequirePermissions('approvals.expense:read')
  @ApiOperation({ summary: 'List expense claims pending manager approval' })
  list(@Req() req: TenantRequest) {
    return this.expenseService.listPendingManager(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get(':id')
  @RequirePermissions('approvals.expense:read')
  @ApiOperation({ summary: 'Get expense claim for manager review' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenseService.getManagerDetail(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Get(':id/lines/:lineId/receipt/preview')
  @RequirePermissions('approvals.expense:read')
  @ApiOperation({ summary: 'Preview receipt as manager' })
  receiptPreview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptPreview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'manager',
    );
  }

  @Get(':id/lines/:lineId/receipt')
  @RequirePermissions('approvals.expense:read')
  @ApiOperation({ summary: 'Download receipt as manager' })
  receipt(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptDownload(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'manager',
    );
  }

  @Post(':id/approve')
  @RequirePermissions('approvals.expense:act')
  @ApiOperation({ summary: 'Manager approve expense claim' })
  approve(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveApprovalDto,
  ) {
    return this.expenseService.managerApprove(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.notes,
    );
  }

  @Post(':id/reject')
  @RequirePermissions('approvals.expense:act')
  @ApiOperation({ summary: 'Manager reject expense claim' })
  reject(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.expenseService.managerReject(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/send-back')
  @RequirePermissions('approvals.expense:act')
  @ApiOperation({ summary: 'Manager send back expense claim' })
  sendBack(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendBackExpenseDto,
  ) {
    return this.expenseService.managerSendBack(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }
}

@ApiTags('Expense Finance')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/expense/finance')
export class EssExpenseFinanceController {
  constructor(private readonly expenseService: EssExpenseService) {}

  @Get('pending')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'List claims pending finance approval' })
  pending(@Req() req: TenantRequest) {
    return this.expenseService.listFinancePending(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get('payable')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'List approved claims ready to pay' })
  payable(@Req() req: TenantRequest) {
    return this.expenseService.listPayable(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get('export')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'Export approved/paid claims as CSV' })
  async export(
    @Req() req: TenantRequest,
    @Query('status') status?: 'APPROVED' | 'PAID' | 'BOTH',
  ) {
    const csv = await this.expenseService.exportCsv(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      status,
    );
    return { csv };
  }

  @Get(':id')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'Get claim detail for finance' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenseService.getFinanceDetail(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
  }

  @Get(':id/lines/:lineId/receipt/preview')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'Preview receipt as finance' })
  receiptPreview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptPreview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'finance',
    );
  }

  @Get(':id/lines/:lineId/receipt')
  @RequirePermissions('expense.finance:read')
  @ApiOperation({ summary: 'Download receipt as finance' })
  receipt(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
  ) {
    return this.expenseService.getReceiptDownload(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      lineId,
      'finance',
    );
  }

  @Post(':id/approve')
  @RequirePermissions('expense.finance:act')
  @ApiOperation({ summary: 'Finance approve expense claim' })
  approve(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveApprovalDto,
  ) {
    return this.expenseService.financeApprove(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.notes,
    );
  }

  @Post(':id/reject')
  @RequirePermissions('expense.finance:act')
  @ApiOperation({ summary: 'Finance reject expense claim' })
  reject(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.expenseService.financeReject(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/send-back')
  @RequirePermissions('expense.finance:act')
  @ApiOperation({ summary: 'Finance send back expense claim' })
  sendBack(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendBackExpenseDto,
  ) {
    return this.expenseService.financeSendBack(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto.reason,
    );
  }

  @Post(':id/mark-paid')
  @RequirePermissions('expense.finance:act')
  @ApiOperation({ summary: 'Mark approved claim as paid' })
  markPaid(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkExpensePaidDto,
  ) {
    return this.expenseService.markPaid(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }
}

@ApiTags('Expense Settings')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('settings/expense')
export class ExpenseSettingsController {
  constructor(private readonly expenseService: EssExpenseService) {}

  @Get('categories')
  @RequirePermissions('settings.expense:read')
  @ApiOperation({ summary: 'List all expense categories (admin)' })
  listCategories(@Req() req: TenantRequest) {
    return this.expenseService.listAllCategories(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Post('categories')
  @RequirePermissions('settings.expense:write')
  @ApiOperation({ summary: 'Replace expense categories' })
  async upsertCategories(
    @Req() req: TenantRequest,
    @Body() dto: UpdateExpenseCategoriesDto,
  ) {
    const result = await this.expenseService.upsertCategories(
      req.tenantDataSource!,
      req.organization!.id,
      dto.categories,
    );
    return {
      message: 'Expense categories updated successfully',
      ...result,
    };
  }

  @Get('policy')
  @RequirePermissions('settings.expense:read')
  @ApiOperation({ summary: 'Get expense policy defaults' })
  getPolicy(@Req() req: TenantRequest) {
    return this.expenseService.getPolicy(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Post('policy')
  @RequirePermissions('settings.expense:write')
  @ApiOperation({ summary: 'Update expense policy defaults' })
  async updatePolicy(
    @Req() req: TenantRequest,
    @Body() dto: UpdateExpensePolicyDto,
  ) {
    const policy = await this.expenseService.updatePolicy(
      req.tenantDataSource!,
      dto,
    );
    return { message: 'Expense policy updated successfully', ...policy };
  }
}
