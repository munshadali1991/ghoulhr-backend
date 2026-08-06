import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTestEmailDto {
  @ApiProperty({
    example: 'you@example.com',
    description: 'Recipient address for the SES test email',
  })
  @IsEmail()
  to: string;

  @ApiPropertyOptional({
    example: 'GhoulHR SES test email',
    description: 'Optional subject override',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({
    example: 'If you received this, Amazon SES SMTP is working.',
    description: 'Optional plain-text body override',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
