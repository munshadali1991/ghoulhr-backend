import { ApiProperty } from '@nestjs/swagger';

import { IsIn } from 'class-validator';

import { LeaveRequestStatus } from '../../entities/leave-request.entity';



const LISTABLE_STATUSES = [

  LeaveRequestStatus.PENDING,

  LeaveRequestStatus.APPROVED,

  LeaveRequestStatus.REJECTED,

] as const;



export type EssLeaveRequestListStatus = (typeof LISTABLE_STATUSES)[number];



export class GetLeaveRequestsQueryDto {

  @ApiProperty({ enum: LISTABLE_STATUSES, example: LeaveRequestStatus.PENDING })

  @IsIn(LISTABLE_STATUSES)

  status: EssLeaveRequestListStatus;

}


