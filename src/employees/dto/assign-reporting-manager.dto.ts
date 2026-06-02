import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

export class AssignReportingManagerDto {
  @ApiProperty({ description: 'Employee id of the reporting manager' })
  @Transform(emptyStringToUndefined)
  @IsUUID()
  managerEmployeeId: string;

  @ApiPropertyOptional({ example: '2026-05-26' })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsDateString()
  effectiveFrom?: string;
}
