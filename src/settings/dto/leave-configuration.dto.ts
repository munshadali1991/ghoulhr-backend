import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LeaveConfigurationItemDto {
  @ApiProperty({ example: '5dc8f7bc-ecf1-459b-8a1b-2e6a5d7d0eb4' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'FK to locations_configurations (location)' })
  @IsUUID()
  locationId: string;

  @ApiProperty({ example: 'Casual leave' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  name: string;

  @ApiProperty({ required: false, example: 'CL' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ required: false, example: 'CASUAL' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  leaveCategory?: string;

  @ApiProperty({ required: false, example: 'MONTHLY' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  accrualType?: string;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  encashmentAllowed?: boolean;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  negativeBalanceAllowed?: boolean;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  supportingDocumentAfterDays?: number;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  weekendsCountAsLeave?: boolean;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  holidaysCountAsLeave?: boolean;

  @ApiProperty({ required: false, type: [String], example: ['MANAGER', 'HR', 'ADMIN'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvalWorkflow?: string[];

  @ApiProperty({
    required: false,
    enum: ['ALL_EMPLOYEES', 'ALL_BRANCHES'],
    description:
      'ALL_EMPLOYEES: current location only. ALL_BRANCHES: organization-wide (all locations).',
  })
  @IsOptional()
  @IsString()
  @IsIn(['ALL_EMPLOYEES', 'ALL_BRANCHES'])
  @MaxLength(32)
  appliesTo?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isPaid: boolean;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(366)
  annualEntitlementDays: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  allowCarryForward: boolean;

  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(366)
  maxCarryForwardDays?: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  requiresApproval: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  requiresSupportingDocument: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  allowHalfDay: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLeaveConfigurationsDto {
  @ApiProperty({ type: [LeaveConfigurationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaveConfigurationItemDto)
  leaves: LeaveConfigurationItemDto[];
}
