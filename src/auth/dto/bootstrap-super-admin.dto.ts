import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class BootstrapSuperAdminDto {
  @ApiProperty({ example: 'superadmin@ghoulhr.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'SuperAdmin@123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'GhoulHRMS' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  organizationName?: string;

  @ApiPropertyOptional({ example: 'ghoulhr' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'subdomain can only contain lowercase letters, numbers, and hyphens',
  })
  subdomain?: string;
}
