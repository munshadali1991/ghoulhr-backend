import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SupportingDocumentDto {
  @ApiProperty({ example: 'LEAVE_SUPPORTING' })
  @IsString()
  @MaxLength(64)
  documentType: string;

  @ApiProperty({ example: 'certificate.pdf' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(128)
  mimeType: string;

  @ApiPropertyOptional({ description: 'Base64-encoded file body (legacy)' })
  @IsOptional()
  @IsString()
  dataBase64?: string;

  @ApiPropertyOptional({ description: 'S3 object key from POST /storage/upload' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  storageKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15 * 1024 * 1024)
  sizeBytes?: number;
}
