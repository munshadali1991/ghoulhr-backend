import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

function emptyStringToUndefined({ value }: { value: unknown }) {
  return value === '' || value === null ? undefined : value;
}

/** Coerce optional numeric fields that may arrive as strings from JSON clients. */
function optionalInt({ value }: { value: unknown }) {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n);
}

function intSizeBytes({ value }: { value: unknown }) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

export class OnboardingBasicDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @ApiProperty()
  @IsEmail()
  personalEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  officialEmail?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  mobileNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alternateMobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @ApiPropertyOptional({ description: 'S3 storage key from POST /storage/upload' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  profilePhotoStorageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profilePhotoFileName?: string;
}

export class OnboardingEmploymentDto {
  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  dateOfJoining: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  hrManagerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsUUID()
  designationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(optionalInt)
  @IsInt()
  @Min(0)
  @Max(3650)
  probationPeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(optionalInt)
  @IsInt()
  @Min(0)
  @Max(730)
  noticePeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  team?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradeBand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  costCenter?: string;
}

export class OnboardingExperienceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousCompanyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousDesignation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(80)
  totalExperienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lastDrawnCtc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  experienceSummary?: string;
}

export class OnboardingPayrollDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ctc?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryStructure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  basicSalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hra?: number;

  @ApiPropertyOptional()
  @IsOptional()
  allowances?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pfApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  esicApplicable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxRegime?: string;
}

export class OnboardingBankDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ifscCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  @IsOptional()
  @IsString()
  verificationStatus?: string;
}

export class OnboardingComplianceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aadhaarNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  uanNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  esicNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pfNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  passportExpiry?: Date;
}

export class OnboardingDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  documentType: string;

  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiProperty()
  @IsString()
  mimeType: string;

  @ApiProperty()
  @Type(() => Number)
  @Transform(intSizeBytes)
  @IsInt()
  @Min(1)
  @Max(15 * 1024 * 1024)
  sizeBytes: number;

  /** Base64 payload for inline storage (legacy). Prefer storageKey for S3 uploads. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dataBase64?: string;

  /** S3 object key from POST /storage/upload */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  storageKey?: string;
}

export class OnboardingEmergencyContactDto {
  @ApiPropertyOptional({ description: 'Emergency contact full name' })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional({
    description: 'Phone number (digits / spaces / leading +)',
  })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({
    example: 'Spouse',
    description: 'Relationship to the employee',
  })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MaxLength(120)
  relationship?: string;
}

export class OnboardingAccessDto {
  @ApiPropertyOptional({ enum: ['EMPLOYEE', 'MANAGER', 'HR', 'PAYROLL', 'ADMIN'] })
  @IsOptional()
  @IsString()
  portalRoleLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hrmsAccessEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  welcomeEmailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mfaEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'If omitted, a secure temporary password is generated',
  })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(12)
  temporaryPassword?: string;
}

export class EmployeeOnboardingCreateDto {
  @ApiProperty({ type: OnboardingBasicDto })
  @ValidateNested()
  @Type(() => OnboardingBasicDto)
  basic: OnboardingBasicDto;

  @ApiProperty({ type: OnboardingEmploymentDto })
  @ValidateNested()
  @Type(() => OnboardingEmploymentDto)
  employment: OnboardingEmploymentDto;

  @ApiPropertyOptional({ type: OnboardingPayrollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingPayrollDto)
  payroll?: OnboardingPayrollDto;

  @ApiPropertyOptional({ type: OnboardingExperienceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingExperienceDto)
  experience?: OnboardingExperienceDto;

  @ApiPropertyOptional({ type: OnboardingBankDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingBankDto)
  bank?: OnboardingBankDto;

  @ApiPropertyOptional({ type: OnboardingComplianceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingComplianceDto)
  compliance?: OnboardingComplianceDto;

  @ApiPropertyOptional({ type: OnboardingEmergencyContactDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OnboardingEmergencyContactDto)
  emergencyContact?: OnboardingEmergencyContactDto;

  @ApiPropertyOptional({ type: [OnboardingDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingDocumentDto)
  documents?: OnboardingDocumentDto[];

  @ApiPropertyOptional({
    description: 'Document IDs to remove (edit flow only)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  deletedDocumentIds?: string[];

  @ApiProperty({ type: OnboardingAccessDto })
  @ValidateNested()
  @Type(() => OnboardingAccessDto)
  access: OnboardingAccessDto;
}

export class CheckEmployeeDuplicateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  personalEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  officialEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @ApiPropertyOptional({
    description: 'When editing, exclude this employee from duplicate checks',
  })
  @IsOptional()
  @IsUUID()
  excludeEmployeeId?: string;
}
