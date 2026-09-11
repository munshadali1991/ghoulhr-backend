import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AttendanceRegularizationStatus } from '../../entities/attendance-regularization-request.entity';

const LISTABLE_STATUSES = [
  AttendanceRegularizationStatus.PENDING,
  AttendanceRegularizationStatus.APPROVED,
  AttendanceRegularizationStatus.REJECTED,
  AttendanceRegularizationStatus.WITHDRAWN,
] as const;

export type EssRegularizationListStatus = (typeof LISTABLE_STATUSES)[number];

export class GetAttendanceRegularizationQueryDto {
  @ApiPropertyOptional({ enum: LISTABLE_STATUSES })
  @IsOptional()
  @IsIn(LISTABLE_STATUSES)
  status?: EssRegularizationListStatus;
}
