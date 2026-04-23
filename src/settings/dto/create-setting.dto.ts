import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean, IsNumber, IsArray, ArrayNotEmpty, ArrayUnique, Min, MaxLength, ValidateNested, IsObject, Matches, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, SUPPORTED_DATE_FORMATS, SUPPORTED_LANGUAGES, ALLOWED_EMPLOYEE_FIELDS, VALID_WEEKDAYS, VALID_TRACKING_MODES } from '../settings.constants';

export class CreateSettingDto {
  @ApiProperty({ example: 'org.name' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Acme Corporation' })
  @IsNotEmpty()
  value: any;
}

export class UpdateOrgProfileDto {
  @ApiProperty({ example: 'Acme Corporation', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 'https://cdn.example.com/logo.png', required: false })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiProperty({ example: 'Asia/Kolkata', required: false })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_TIMEZONES as readonly string[])
  timezone?: string;

  @ApiProperty({ example: 'INR', required: false })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES as readonly string[])
  currency?: string;

  @ApiProperty({ example: 'DD/MM/YYYY', required: false })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_DATE_FORMATS as readonly string[])
  dateFormat?: string;

  @ApiProperty({ example: 'en', required: false })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LANGUAGES as readonly string[])
  language?: string;
}

export class UpdateEmployeeSettingsDto {
  @ApiProperty({ 
    example: 'EMP', 
    description: 'Prefix for employee IDs (max 10 characters)',
    required: false 
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  id_prefix?: string;

  @ApiProperty({ 
    example: true, 
    description: 'Whether to auto-generate employee IDs',
    required: false 
  })
  @IsOptional()
  @IsBoolean()
  auto_generate_id?: boolean;

  @ApiProperty({ 
    example: ['name', 'email'], 
    description: 'Required fields for employee records',
    required: false 
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(ALLOWED_EMPLOYEE_FIELDS as readonly string[], { each: true })
  required_fields?: string[];

  @ApiProperty({ 
    example: 90, 
    description: 'Default probation period in days (positive number)',
    required: false 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  default_probation_period?: number;
}

// Custom validator for shift time validation
@ValidatorConstraint({ async: false })
export class ShiftTimeValidConstraint implements ValidatorConstraintInterface {
  validate(shifts: ShiftDto[], args: ValidationArguments) {
    if (!Array.isArray(shifts)) return false;
    
    for (const shift of shifts) {
      if (!shift.start_time || !shift.end_time) return false;
      
      const [startH, startM] = shift.start_time.split(':').map(Number);
      const [endH, endM] = shift.end_time.split(':').map(Number);
      
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      
      if (startMinutes >= endMinutes) {
        return false;
      }
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Each shift must have start_time before end_time';
  }
}

export function ShiftTimeValid(validationOptions?: ValidationOptions) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: ShiftTimeValidConstraint,
    });
  };
}

export class ShiftDto {
  @ApiProperty({ example: 'Morning Shift' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '09:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start_time must be in HH:mm format' })
  start_time: string;

  @ApiProperty({ example: '18:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end_time must be in HH:mm format' })
  end_time: string;

  @ApiProperty({ example: 60, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  break_minutes?: number;
}

export class UpdateAttendanceSettingsDto {
  @ApiProperty({ example: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(VALID_WEEKDAYS as readonly string[], { each: true })
  working_days?: string[];

  @ApiProperty({ type: [ShiftDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'shifts array must not be empty' })
  @ValidateNested({ each: true })
  @Type(() => ShiftDto)
  @ShiftTimeValid({ message: 'Each shift must have start_time before end_time' })
  shifts?: ShiftDto[];

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_period_minutes?: number;

  @ApiProperty({ example: 240, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  half_day_threshold_minutes?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  overtime_enabled?: boolean;

  @ApiProperty({ example: { max_hours_per_day: 2, multiplier: 1.5 }, required: false })
  @IsOptional()
  @IsObject()
  overtime_rules?: Record<string, any>;

  @ApiProperty({ example: 'manual', enum: VALID_TRACKING_MODES, required: false })
  @IsOptional()
  @IsString()
  @IsIn(VALID_TRACKING_MODES as readonly string[])
  tracking_mode?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  geo_fencing_enabled?: boolean;

  @ApiProperty({ example: ['192.168.1.1', '10.0.0.0/24'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/(?:3[0-2]|[12]?[0-9]))?$/, 
    { each: true, message: 'Each IP address must be valid IPv4 format (CIDR notation optional)' })
  allowed_ip_addresses?: string[];
}
