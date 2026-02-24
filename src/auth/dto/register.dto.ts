import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../roles/roles.enum';

export class RegisterDto {
  @ApiProperty({ example: 'employee@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'Passw0rd!23' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.EMPLOYEE })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when host is not tenant-scoped',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
