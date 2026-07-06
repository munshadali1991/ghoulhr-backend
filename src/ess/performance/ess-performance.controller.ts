import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';
import { EssPerformanceService } from './ess-performance.service';
import { SaveAssessmentDraftDto } from './dto/save-assessment-draft.dto';
import { ReviewAssessmentDto } from './dto/review-assessment.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { ListReviewAssessmentsQueryDto } from './dto/list-review-assessments-query.dto';

@ApiTags('ESS Performance')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/performance')
export class EssPerformanceController {
  constructor(private readonly performanceService: EssPerformanceService) {}

  @Get('assessments')
  @RequirePermissions('ess.performance:read')
  @ApiOperation({ summary: 'List my performance assessments' })
  listMyAssessments(@Req() req: TenantRequest) {
    return this.performanceService.listMyAssessments(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Get('assessments/reviews')
  @RequireAnyPermission('performance.hr:read', 'performance.review:read')
  @ApiOperation({ summary: 'List team or org assessments for manager/HR review' })
  listReviewAssessments(
    @Req() req: TenantRequest,
    @Query() query: ListReviewAssessmentsQueryDto,
  ) {
    return this.performanceService.listReviewAssessments(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      query,
    );
  }

  @Get('assessments/:id')
  @RequireAnyPermission(
    'ess.performance:read',
    'performance.review:read',
    'performance.hr:read',
  )
  @ApiOperation({ summary: 'Get an assessment with answers and header context' })
  getAssessment(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.performanceService.getAssessment(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
  }

  @Put('assessments/:id/draft')
  @RequirePermissions('ess.performance:write')
  @ApiOperation({ summary: 'Save self-assessment answers as a draft' })
  saveDraft(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveAssessmentDraftDto,
  ) {
    return this.performanceService.saveDraft(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Post('assessments/:id/submit')
  @RequirePermissions('ess.performance:write')
  @ApiOperation({ summary: 'Submit the self-assessment' })
  submitAssessment(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveAssessmentDraftDto,
  ) {
    return this.performanceService.submitAssessment(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Put('assessments/:id/manager-review')
  @RequirePermissions('performance.review:act')
  @ApiOperation({ summary: 'Manager completes the manager-review section' })
  saveManagerReview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAssessmentDto,
  ) {
    return this.performanceService.saveManagerReview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Put('assessments/:id/hr-review')
  @RequirePermissions('performance.hr:act')
  @ApiOperation({ summary: 'HR completes the HR-feedback section' })
  saveHrReview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAssessmentDto,
  ) {
    return this.performanceService.saveHrReview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
  }

  @Put('assessments/:id/role-review/:roleCode')
  @RequireAnyPermission(
    'ess.performance:read',
    'performance.review:read',
    'performance.hr:read',
  )
  @ApiOperation({ summary: 'Save answers for a custom RBAC role section' })
  saveRoleReview(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleCode') roleCode: string,
    @Body() dto: ReviewAssessmentDto,
  ) {
    return this.performanceService.saveRoleReview(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      roleCode,
      dto,
    );
  }

  @Post('assessments')
  @RequirePermissions('performance.hr:act')
  @ApiOperation({ summary: 'HR assigns an assessment cycle to an employee' })
  createAssessment(
    @Req() req: TenantRequest,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.performanceService.createAssessment(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
  }
}
