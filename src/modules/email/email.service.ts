import { Injectable, Logger } from '@nestjs/common';

export interface SendAdminCredentialsDto {
  to: string;
  organizationName: string;
  subdomain: string;
  email: string;
  password: string;
}

export interface SendEmployeeCredentialsDto {
  to: string;
  organizationName: string;
  email: string;
  password: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Send admin credentials email when a new organization is created
   */
  async sendAdminCredentials(params: SendAdminCredentialsDto): Promise<void> {
    // TODO: Replace with actual email sending logic
    // Example: Using nodemailer, sendgrid, aws ses, etc.
    
    this.logger.log(
      `Sending admin credentials email to ${params.to} for organization "${params.organizationName}"`,
    );
    this.logger.log(`Login URL: https://${params.subdomain}.ghoulhr.com/login`);
    this.logger.log(`Email: ${params.email}`);
    this.logger.log(`Password: ${params.password}`);
    
    // Future implementation example:
    // await this.mailerService.sendMail({
    //   to: params.to,
    //   subject: `Welcome to ${params.organizationName} - Your Admin Credentials`,
    //   template: 'admin-credentials',
    //   context: {
    //     organizationName: params.organizationName,
    //     subdomain: params.subdomain,
    //     email: params.email,
    //     password: params.password,
    //     loginUrl: `https://${params.subdomain}.ghoulhr.com/login`,
    //   },
    // });
  }

  /**
   * Send employee credentials email when a new employee is onboarded
   */
  async sendEmployeeCredentials(params: SendEmployeeCredentialsDto): Promise<void> {
    // TODO: Replace with actual email sending logic
    
    this.logger.log(
      `Sending employee credentials email to ${params.to} for organization "${params.organizationName}"`,
    );
    this.logger.log(`Email: ${params.email}`);
    this.logger.log(`Password: ${params.password}`);
    
    // Future implementation example:
    // await this.mailerService.sendMail({
    //   to: params.to,
    //   subject: `Welcome to ${params.organizationName} - Your Employee Credentials`,
    //   template: 'employee-credentials',
    //   context: {
    //     organizationName: params.organizationName,
    //     email: params.email,
    //     password: params.password,
    //   },
    // });
  }
}
