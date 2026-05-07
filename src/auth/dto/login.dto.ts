import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'employee@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Passw0rd!23' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    example: 'acme',
    description:
      'Organization subdomain for tenant routing (required for employee login)',
  })
  @IsString()
  @IsOptional()
  subdomain?: string;
}
