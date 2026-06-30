import { Global, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationSubscription } from './organization-subscription.entity';
import { OrganizationSubscriptionService } from './organization-subscription.service';
import { OrganizationSubscriptionController } from './organization-subscription.controller';
import { SubscriptionExpiryCronService } from './subscription-expiry.cron';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionGuard } from './guards/subscription.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationSubscription]),
    forwardRef(() => OrganizationsModule),
  ],
  providers: [
    OrganizationSubscriptionService,
    SubscriptionExpiryCronService,
    SubscriptionGuard,
  ],
  controllers: [OrganizationSubscriptionController],
  exports: [OrganizationSubscriptionService, SubscriptionGuard],
})
export class SubscriptionsModule {}
