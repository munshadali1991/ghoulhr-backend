import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PendingLeaveApprovalReminderService } from './pending-leave-approval-reminder.service';

@Injectable()
export class PendingLeaveApprovalReminderCronService {
  private readonly logger = new Logger(
    PendingLeaveApprovalReminderCronService.name,
  );

  constructor(
    private readonly reminderService: PendingLeaveApprovalReminderService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyTick(): Promise<void> {
    try {
      await this.reminderService.runForAllTenants();
    } catch (error) {
      this.logger.error(
        `Month-end leave reminder cron failed: ${(error as Error).message}`,
      );
    }
  }
}
