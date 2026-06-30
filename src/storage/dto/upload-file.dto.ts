import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  STORAGE_CATEGORIES,
  STORAGE_MODULES,
  type StorageCategory,
  type StorageModule,
} from '../storage.constants';

export class UploadFileDto {
  @ApiProperty({ enum: STORAGE_CATEGORIES })
  @IsIn(STORAGE_CATEGORIES)
  category: StorageCategory;

  @ApiProperty({ enum: STORAGE_MODULES })
  @IsIn(STORAGE_MODULES)
  module: StorageModule;

  @ApiPropertyOptional({ example: 'PAN_CARD' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leaveRequestId?: string;

  @ApiPropertyOptional({
    description: 'Wizard batch id for onboarding before employee exists',
  })
  @IsOptional()
  @IsUUID()
  uploadBatchId?: string;
}
