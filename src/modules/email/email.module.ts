import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { SesMailerService } from './ses-mailer.service';

@Module({
  controllers: [EmailController],
  providers: [SesMailerService, EmailService],
  exports: [EmailService, SesMailerService],
})
export class EmailModule {}
