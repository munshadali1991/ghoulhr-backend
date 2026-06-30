import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class SesMailerService {
  private readonly logger = new Logger(SesMailerService.name);
  private readonly enabled: boolean;
  private readonly fromAddress: string;
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('AWS_SES_SMTP_ENDPOINT');
    const port = Number(
      this.configService.get<string>('AWS_SES_SMTP_PORT') || 587,
    );
    const username = this.configService.get<string>('AWS_SES_SMTP_USERNAME');
    const password = this.configService.get<string>('AWS_SES_SMTP_PASSWORD');
    const fromEmail = this.configService.get<string>('AWS_SES_FROM_EMAIL');
    const fromName =
      this.configService.get<string>('AWS_SES_FROM_NAME') || 'GhoulHR';

    const missing = [
      !host ? 'AWS_SES_SMTP_ENDPOINT' : null,
      !username ? 'AWS_SES_SMTP_USERNAME' : null,
      !password ? 'AWS_SES_SMTP_PASSWORD' : null,
      !fromEmail ? 'AWS_SES_FROM_EMAIL' : null,
    ].filter(Boolean);

    if (missing.length > 0) {
      this.enabled = false;
      this.fromAddress = '';
      this.transporter = null;
      this.logger.warn(
        `AWS SES email is not fully configured. Missing: ${missing.join(', ')}. ` +
          'Email notifications will be skipped until these are set in .env.',
      );
      return;
    }

    this.enabled = true;
    this.fromAddress = fromName
      ? `"${fromName}" <${fromEmail}>`
      : fromEmail!;

    this.transporter = nodemailer.createTransport({
      host: host!,
      port,
      secure: port === 465,
      auth: {
        user: username!,
        pass: password!,
      },
    });

    this.logger.log(
      `AWS SES email configured: from=${fromEmail}, host=${host}, port=${port}`,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendMail(params: SendMailParams): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.warn(
        `Skipped email to ${params.to} (subject: "${params.subject}") — SES not configured`,
      );
      return false;
    }

    const to = params.to?.trim().toLowerCase();
    if (!to) {
      this.logger.warn('Skipped email — recipient address is empty');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
      this.logger.log(`Email sent to ${to} (subject: "${params.subject}")`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send email to ${to} (subject: "${params.subject}"): ${message}`,
      );
      return false;
    }
  }
}
