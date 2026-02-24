import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationStatus } from '../organization-status.enum';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'acme' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'subdomain can only contain lowercase letters, numbers, and hyphens',
  })
  subdomain: string;

  @ApiPropertyOptional({ enum: OrganizationStatus, default: OrganizationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industryType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationType?: string;

  @ApiPropertyOptional({ example: '2024-01-31' })
  @IsOptional()
  @IsString()
  dateOfIncorporation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyLogo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  financialYearStartMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registeredOfficeAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pinCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  officialEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tanNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pfEstablishmentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  esiCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalTaxRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  labourWelfareFundDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cinNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryStructureTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultEarningsAndDeductions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pfEsiApplicability?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tdsSettings?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankDetailsForSalaryProcessing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payCycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryDisbursementDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminMobileNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminRolePermissions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 4999 })
  @IsOptional()
  @IsNumber()
  monthlySubscriptionAmount?: number;
}
