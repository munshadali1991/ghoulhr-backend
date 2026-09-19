import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BiometricDeviceBrand,
  BiometricDeviceStatus,
} from '../entities/biometric-device.entity';

export class CreateBiometricDeviceDto {
  @ApiProperty({ example: 'ZKTECO-ABC123' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  serialNumber: string;

  @ApiProperty({ example: 'Lobby Entrance' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: BiometricDeviceBrand })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ enum: BiometricDeviceStatus })
  @IsOptional()
  @IsIn(Object.values(BiometricDeviceStatus))
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firmwareVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Optional ADMS communication key' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  commKey?: string;
}

export class UpdateBiometricDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @ApiPropertyOptional({ enum: BiometricDeviceStatus })
  @IsOptional()
  @IsIn(Object.values(BiometricDeviceStatus))
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firmwareVersion?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  commKey?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignBiometricIdDto {
  @ApiPropertyOptional({
    description: 'Omit to auto-assign the next free positive integer',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  biometricId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ResolveUnmappedPunchDto {
  @ApiProperty({ enum: ['bind', 'ignore'] })
  @IsIn(['bind', 'ignore'])
  action: 'bind' | 'ignore';

  @ApiPropertyOptional({ description: 'Required when action=bind' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
