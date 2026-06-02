import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SupportingDocumentDto } from './supporting-document.dto';

export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'FK to leave_configurations' })
  @IsUUID()
  leaveConfigurationId: string;

  @ApiProperty({ example: '2026-05-22' })
  @IsDateString()
  fromDate: string;

  @ApiProperty({ example: '2026-05-24' })
  @IsDateString()
  toDate: string;

  @ApiProperty({ example: 'Session 1' })
  @IsString()
  @MaxLength(64)
  fromSession: string;

  @ApiProperty({ example: 'Session 2' })
  @IsString()
  @MaxLength(64)
  toSession: string;

  @ApiProperty({ description: 'Approver employee id (applyingTo)' })
  @IsUUID()
  applyingTo: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contactDetails?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supportingDocumentId?: string;

  @ApiPropertyOptional({ type: SupportingDocumentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupportingDocumentDto)
  supportingDocument?: SupportingDocumentDto;

  @ApiPropertyOptional({
    description:
      'When true, notify all active employees via in-app and email (legacy)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyAllEmployees?: boolean;

  @ApiPropertyOptional({
    description: 'Employee ids to notify about this leave (Cc)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ccEmployeeIds?: string[];
}
