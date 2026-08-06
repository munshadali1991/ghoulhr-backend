import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SesMailerService } from './ses-mailer.service';
import { renderEmployeeCreatedEmail } from './templates/employee-created.template';
import { renderLeaveAppliedEmail } from './templates/leave-applied.template';
import { renderLeaveApprovedEmail } from './templates/leave-approved.template';
import { renderTimesheetApprovedEmail } from './templates/timesheet-approved.template';
import { renderAccountActivatedEmail } from './templates/account-activated.template';
import { buildTenantLoginUrl } from '../../common/utils/tenant-login-url.util';

export interface SendEmployeeCreatedEmailDto {
  to: string;
  employeeName: string;
  organizationName: string;
  subdomain: string;
  email: string;
  temporaryPassword: string;
  departmentName?: string;
  designationName?: string;
}

export interface SendLeaveAppliedEmailDto {
  to: string;
  approverName: string;
  applicantName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface SendLeaveApprovedEmailDto {
  to: string;
  recipientName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface SendTimesheetApprovedEmailDto {
  to: string;
  employeeName: string;
  approverName: string;
  entries: Array<{ workDate: string; totalHours: number }>;
}

export interface SendAccountActivatedEmailDto {
  to: string;
  employeeName: string;
  organizationName: string;
  subdomain: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly sesMailer: SesMailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendEmployeeCreated(
    params: SendEmployeeCreatedEmailDto,
  ): Promise<void> {
    const loginUrl = this.buildTenantLoginUrl(params.subdomain);
    const rendered = renderEmployeeCreatedEmail({
      employeeName: params.employeeName,
      organizationName: params.organizationName,
      email: params.email,
      temporaryPassword: params.temporaryPassword,
      loginUrl,
      departmentName: params.departmentName,
      designationName: params.designationName,
    });

    await this.sesMailer.sendMail({
      to: params.to,
      ...rendered,
    });
  }

  async sendLeaveApplied(params: SendLeaveAppliedEmailDto): Promise<void> {
    const rendered = renderLeaveAppliedEmail({
      approverName: params.approverName,
      applicantName: params.applicantName,
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      reason: params.reason,
    });

    await this.sesMailer.sendMail({
      to: params.to,
      ...rendered,
    });
  }

  async sendLeaveApproved(params: SendLeaveApprovedEmailDto): Promise<void> {
    const rendered = renderLeaveApprovedEmail({
      recipientName: params.recipientName,
      leaveType: params.leaveType,
      startDate: params.startDate,
      endDate: params.endDate,
      notes: params.notes,
    });

    await this.sesMailer.sendMail({
      to: params.to,
      ...rendered,
    });
  }

  async sendTimesheetApproved(
    params: SendTimesheetApprovedEmailDto,
  ): Promise<void> {
    if (params.entries.length === 0) {
      return;
    }

    const rendered = renderTimesheetApprovedEmail({
      employeeName: params.employeeName,
      approverName: params.approverName,
      entries: params.entries,
    });

    await this.sesMailer.sendMail({
      to: params.to,
      ...rendered,
    });
  }

  async sendAccountActivated(
    params: SendAccountActivatedEmailDto,
  ): Promise<void> {
    const loginUrl = this.buildTenantLoginUrl(params.subdomain);
    const rendered = renderAccountActivatedEmail({
      employeeName: params.employeeName,
      organizationName: params.organizationName,
      loginUrl,
    });

    await this.sesMailer.sendMail({
      to: params.to,
      ...rendered,
    });
  }

  async sendTestEmail(params: {
    to: string;
    subject?: string;
    message?: string;
  }): Promise<boolean> {
    const subject = params.subject?.trim() || 'GhoulHR SES test email';
    const message =
      params.message?.trim() ||
      'This is a test email from GhoulHR using Amazon SES SMTP. If you received it, email delivery is working.';
    const safeHtml = message
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\n', '<br />');

    return this.sesMailer.sendMail({
      to: params.to,
      subject,
      text: message,
      html: `<p>${safeHtml}</p>`,
    });
  }

  private buildTenantLoginUrl(subdomain: string): string {
    return buildTenantLoginUrl(this.configService, subdomain);
  }
}
