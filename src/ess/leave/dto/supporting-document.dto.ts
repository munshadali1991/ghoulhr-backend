import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SupportingDocumentDto {
  @ApiProperty({ example: 'MEDICAL_CERTIFICATE' })
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

  @ApiPropertyOptional({ description: 'Base64-encoded file body' })
  @IsOptional()
  @IsString()
  dataBase64?: string;
}
