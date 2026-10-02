import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { In, IsNull, Not } from 'typeorm';
import {
  formatDateInOrg,
  isInLastNCalendarDaysOfMonth,
  orgLocalHourForInstant,
  resolveOrgTimezone,
} from '../../common/utils/org-timezone.util';
import { TenantConnectionManager } from '../../core/database/tenant-connection.manager';
import { Employee } from '../../employees/employee.entity';
import { EmailService } from '../../modules/email/email.service';
import { Organization } from '../../organizations/organization.entity';
import { OrganizationsService } from '../../organizations/organizations.service';
import { SettingsService } from '../../settings/settings.service';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../entities/leave-request.entity';

const REMINDER_LOCAL_HOUR = 9;
const LAST_N_DAYS_OF_MONTH = 3;
const MAX_SUMMARY_ITEMS = 5;

@Injectable()
export class PendingLeaveApprovalReminderService {
  private readonly logger = new Logger(
    PendingLeaveApprovalReminderService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly organizationsService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
  ) {}

  async runForAllTenants(now: Date = new Date()): Promise<void> {
    const lock = this.configService
      .get<string>('TENANT_LOCK_SUBDOMAIN')
      ?.trim();
    if (lock) {
      this.logger.debug(
        `Skipping month-end leave reminders (TENANT_LOCK_SUBDOMAIN=${lock})`,
      );
      return;
    }

    const organizations = await this.organizationsService.findAllActive();
    for (const org of organizations) {
      if (!org.dbName) {
        continue;
      }
      try {
        await this.runForOrganization(org, now);
      } catch (error) {
        this.logger.error(
          `Month-end leave reminder failed for org "${org.subdomain}": ${(error as Error).message}`,
        );
      }
    }
  }

  private async runForOrganization(
    org: Organization,
    now: Date,
  ): Promise<void> {
    const dataSource =
      await this.tenantConnectionManager.getOrCreateConnection(org);
    const profile = await this.settingsService.getOrgProfile(dataSource);
    const timezone = resolveOrgTimezone(profile.timezone);

    if (orgLocalHourForInstant(now, timezone) !== REMINDER_LOCAL_HOUR) {
      return;
    }
    if (!isInLastNCalendarDaysOfMonth(now, LAST_N_DAYS_OF_MONTH, timezone)) {
      return;
    }

    const pending = await dataSource.getRepository(LeaveRequest).find({
      where: {
        organizationId: org.id,
        status: LeaveRequestStatus.PENDING,
        approverEmployeeId: Not(IsNull()),
      },
      relations: ['employee', 'leaveConfiguration'],
      order: { appliedOn: 'DESC' },
    });

    if (pending.length === 0) {
      this.logger.log(
        `No pending leave approvals for org "${org.subdomain}" in month-end window`,
      );
      return;
    }

    const byApprover = new Map<string, LeaveRequest[]>();
    for (const row of pending) {
      const approverId = row.approverEmployeeId!;
      const list = byApprover.get(approverId) ?? [];
      list.push(row);
      byApprover.set(approverId, list);
    }

    const approverIds = [...byApprover.keys()];
    const approvers = await dataSource.getRepository(Employee).find({
      where: { id: In(approverIds) },
    });
    const approverById = new Map(approvers.map((a) => [a.id, a]));

    let sent = 0;
    for (const [approverId, rows] of byApprover) {
      const approver = approverById.get(approverId);
      if (!approver?.email?.trim()) {
        this.logger.warn(
          `Skipping leave reminder: approver ${approverId} missing email (org=${org.subdomain})`,
        );
        continue;
      }

      const items = rows.slice(0, MAX_SUMMARY_ITEMS).map((row) => ({
        applicantName: row.employee?.name ?? 'Employee',
        leaveType: row.leaveConfiguration?.name ?? 'Leave',
        startDate: this.formatLeaveDate(row.startDate, timezone),
        endDate: this.formatLeaveDate(row.endDate, timezone),
      }));

      await this.emailService.sendPendingLeaveApprovalReminder({
        to: approver.email.trim(),
        approverName: approver.name || 'Approver',
        subdomain: org.subdomain,
        pendingCount: rows.length,
        items,
      });
      sent += 1;
    }

    this.logger.log(
      `Month-end leave reminders sent for org "${org.subdomain}": ${sent} approver(s), ${pending.length} pending request(s)`,
    );
  }

  private formatLeaveDate(dateKey: string, timezone: string): string {
    const instant = new Date(`${String(dateKey).slice(0, 10)}T12:00:00.000Z`);
    return formatDateInOrg(instant, timezone);
  }
}
