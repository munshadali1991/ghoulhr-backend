import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmployeeRole, EmployeeStatus } from '../employee.entity';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'john.doe@company.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: EmployeeRole })
  @IsOptional()
  @IsEnum(EmployeeRole)
  role?: EmployeeRole;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'Software Engineer' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '2026-04-24' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfJoining?: Date;
}
