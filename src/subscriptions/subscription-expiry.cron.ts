import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrganizationSubscriptionService } from './organization-subscription.service';

@Injectable()
export class SubscriptionExpiryCronService {
  private readonly logger = new Logger(SubscriptionExpiryCronService.name);

  constructor(
    private readonly subscriptionService: OrganizationSubscriptionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markExpiredSubscriptions(): Promise<void> {
    const affected = await this.subscriptionService.markExpiredSubscriptions();
    if (affected > 0) {
      this.logger.log(`Marked ${affected} subscription(s) as EXPIRED`);
    }
  }
}
