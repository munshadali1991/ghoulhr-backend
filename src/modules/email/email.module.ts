import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SesMailerService } from './ses-mailer.service';

@Module({
  providers: [SesMailerService, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
