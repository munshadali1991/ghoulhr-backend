import { Controller, Get, Param, Post, Body, Req, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthTokenGuard } from '../auth/guards/auth-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../roles/roles.enum';
import { OrganizationSubscriptionService } from './organization-subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import { OrganizationsService } from '../organizations/organizations.service';

@ApiTags('Organization Subscriptions')
@ApiBearerAuth('bearer')
@Controller('organizations')
@UseGuards(AuthTokenGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class OrganizationSubscriptionController {
  constructor(
    private readonly subscriptionService: OrganizationSubscriptionService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Get('id/:id/subscription')
  @ApiOperation({ summary: 'Get current subscription with validity' })
  @ApiParam({ name: 'id' })
  async getCurrent(@Param('id') id: string) {
    await this.subscriptionService.ensureOrganizationExists(id, (orgId) =>
      this.organizationsService.findById(orgId),
    );

    const access =
      await this.subscriptionService.getSubscriptionAccessForOrganization(id);

    return {
      subscription: access.subscription,
      summary: this.subscriptionService.toSummary(access),
      isValid: access.isValid,
      reason: access.reason,
    };
  }

  @Get('id/:id/subscriptions')
  @ApiOperation({ summary: 'List paginated subscription history for an organization' })
  @ApiParam({ name: 'id' })
  async getHistory(
    @Param('id') id: string,
    @Query() query: SubscriptionHistoryQueryDto,
  ) {
    await this.subscriptionService.ensureOrganizationExists(id, (orgId) =>
      this.organizationsService.findById(orgId),
    );

    return this.subscriptionService.getSubscriptionHistoryPaginated(id, query);
  }

  @Post('id/:id/subscription')
  @ApiOperation({ summary: 'Assign initial subscription to an organization' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  @ApiResponse({ status: 409, description: 'Active subscription already exists' })
  async assign(
    @Param('id') id: string,
    @Body() dto: CreateSubscriptionDto,
    @Req() req: Request,
  ) {
    await this.subscriptionService.ensureOrganizationExists(id, (orgId) =>
      this.organizationsService.findById(orgId),
    );

    const user = (req as any).user;
    const subscription = await this.subscriptionService.createForOrganization(
      id,
      dto,
      user?.sub,
    );

    const access = this.subscriptionService.getSubscriptionAccess(subscription);

    return {
      subscription,
      summary: this.subscriptionService.toSummary(access),
      isValid: access.isValid,
    };
  }

  @Post('id/:id/subscription/renew')
  @ApiOperation({ summary: 'Renew subscription (supersedes current active plan)' })
  @ApiParam({ name: 'id' })
  async renew(
    @Param('id') id: string,
    @Body() dto: RenewSubscriptionDto,
    @Req() req: Request,
  ) {
    await this.subscriptionService.ensureOrganizationExists(id, (orgId) =>
      this.organizationsService.findById(orgId),
    );

    const user = (req as any).user;
    const subscription = await this.subscriptionService.renewForOrganization(
      id,
      dto,
      user?.sub,
    );

    const access = this.subscriptionService.getSubscriptionAccess(subscription);

    return {
      subscription,
      summary: this.subscriptionService.toSummary(access),
      isValid: access.isValid,
    };
  }
}
