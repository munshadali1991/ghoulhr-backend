import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDate,
  IsBoolean,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EmployeeRole } from '../employee.entity';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john.doe@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: EmployeeRole, default: EmployeeRole.EMPLOYEE })
  @IsOptional()
  @IsEnum(EmployeeRole)
  role?: EmployeeRole;

  @ApiProperty({ example: 'Engineering', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiProperty({ example: '+91-9876543210', required: false })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: '2026-04-24', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfJoining?: Date;

  @ApiProperty({ example: '1990-01-15', required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiProperty({ example: '123 Main Street, City', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Jane Doe - 9876543210', required: false })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiProperty({ example: 'O+', required: false })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiProperty({ example: 'HDFC Bank', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ example: '1234567890', required: false })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ example: 'HDFC0001234', required: false })
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiProperty({ example: 'ABCDE1234F', required: false })
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiProperty({ example: '1234-5678-9012', required: false })
  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @ApiProperty({ example: '123456789012', required: false })
  @IsOptional()
  @IsString()
  uanNumber?: string;

  @ApiProperty({ example: 'KA12345', required: false })
  @IsOptional()
  @IsString()
  esiNumber?: string;

  @ApiProperty({ example: 'KA/BLR/12345', required: false })
  @IsOptional()
  @IsString()
  pfNumber?: string;
}

export class EmployeeCredentialsResponseDto {
  @ApiProperty()
  temporaryPassword: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ default: true })
  mustChangeOnFirstLogin: boolean;
}

export class EmployeeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: EmployeeRole })
  role: EmployeeRole;

  @ApiProperty()
  department?: string;

  @ApiProperty()
  designation?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  dateOfJoining?: Date;

  @ApiProperty()
  createdAt: Date;
}

export class CreateEmployeeResponseDto {
  @ApiProperty()
  employee: EmployeeResponseDto;

  @ApiProperty()
  credentials: EmployeeCredentialsResponseDto;

  @ApiProperty()
  message: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass123!' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewStr0ng!Pass#2026', minLength: 12 })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{12,}$/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  newPassword: string;
}

export class ResetPasswordResponseDto {
  @ApiProperty()
  temporaryPassword: string;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  message: string;
}
