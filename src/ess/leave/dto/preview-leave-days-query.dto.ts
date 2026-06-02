import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, IsUUID, MaxLength } from 'class-validator';

export class PreviewLeaveDaysQueryDto {
  @ApiProperty()
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
}
