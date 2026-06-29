import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class BulkApproveTimesheetDto {
  @ApiProperty({ required: false, type: [String] })
  @ValidateIf((o) => !o.from && !o.to)
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];

  @ApiProperty({ required: false, example: '2026-06-01' })
  @ValidateIf((o) => !o.ids?.length)
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, example: '2026-06-30' })
  @ValidateIf((o) => !o.ids?.length)
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
