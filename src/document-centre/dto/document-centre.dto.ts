import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DocumentCentreCategory,
  DocumentCentreSubcategory,
} from '../entities/document-centre-document.entity';

export class ListDocumentsQueryDto {
  @ApiProperty({ enum: DocumentCentreCategory })
  @IsEnum(DocumentCentreCategory)
  category: DocumentCentreCategory;

  @ApiPropertyOptional({ enum: DocumentCentreSubcategory })
  @IsOptional()
  @IsEnum(DocumentCentreSubcategory)
  subcategory?: DocumentCentreSubcategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  financialYear?: string;
}

export class UpdateDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @ApiPropertyOptional({ enum: DocumentCentreSubcategory })
  @IsOptional()
  @IsEnum(DocumentCentreSubcategory)
  subcategory?: DocumentCentreSubcategory;
}

export class Form16UploadMetaDto {
  @ApiProperty({ example: '2025-26' })
  @IsString()
  @MaxLength(16)
  financialYear: string;

  @ApiPropertyOptional({
    description: 'Required for single PDF upload without ZIP filename mapping',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class PublicDocumentUploadMetaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(512)
  title: string;

  @ApiPropertyOptional({ enum: DocumentCentreSubcategory })
  @IsOptional()
  @IsEnum(DocumentCentreSubcategory)
  subcategory?: DocumentCentreSubcategory;
}
