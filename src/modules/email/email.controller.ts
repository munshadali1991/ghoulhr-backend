import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { EmailService } from './email.service';
import { SesMailerService } from './ses-mailer.service';

@ApiTags('Email')
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly sesMailer: SesMailerService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Check whether Amazon SES SMTP email is configured',
  })
  @ApiResponse({ status: 200, description: 'SES configuration status' })
  getStatus() {
    return {
      enabled: this.sesMailer.isEnabled(),
      provider: 'aws-ses-smtp',
    };
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a test email via the existing Amazon SES SMTP service',
  })
  @ApiBody({ type: SendTestEmailDto })
  @ApiResponse({ status: 200, description: 'Test email accepted/sent' })
  @ApiResponse({
    status: 503,
    description: 'SES not configured or send failed',
  })
  async sendTest(@Body() dto: SendTestEmailDto) {
    if (!this.sesMailer.isEnabled()) {
      throw new ServiceUnavailableException(
        'Amazon SES SMTP is not configured. Set AWS_SES_SMTP_ENDPOINT, AWS_SES_SMTP_USERNAME, AWS_SES_SMTP_PASSWORD, and AWS_SES_FROM_EMAIL.',
      );
    }

    const sent = await this.emailService.sendTestEmail(dto);
    if (!sent) {
      throw new ServiceUnavailableException(
        'Failed to send test email via Amazon SES. Check server logs and SES credentials/verified identities.',
      );
    }

    return {
      ok: true,
      to: dto.to.trim().toLowerCase(),
      message: 'Test email sent via Amazon SES SMTP',
    };
  }
}
