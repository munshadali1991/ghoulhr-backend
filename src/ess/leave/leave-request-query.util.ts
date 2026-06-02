import { DataSource } from 'typeorm';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../entities/leave-request.entity';

const ACTIVE_LEAVE_STATUSES = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
];

export function toDateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** Leave rows overlapping [rangeStart, rangeEnd] (inclusive ISO dates). */
export async function findLeaveRequestsOverlappingRange(
  dataSource: DataSource,
  params: {
    organizationId: string;
    employeeIds: string[];
    rangeStart: string;
    rangeEnd: string;
    statuses?: LeaveRequestStatus[];
    relations?: string[];
  },
): Promise<LeaveRequest[]> {
  const { organizationId, employeeIds, rangeStart, rangeEnd } = params;
  if (employeeIds.length === 0) return [];

  const statuses = params.statuses ?? ACTIVE_LEAVE_STATUSES;

  const qb = dataSource
    .getRepository(LeaveRequest)
    .createQueryBuilder('lr')
    .where('lr.organizationId = :organizationId', { organizationId })
    .andWhere('lr.employeeId IN (:...employeeIds)', { employeeIds })
    .andWhere('lr.status IN (:...statuses)', { statuses })
    .andWhere('lr.startDate <= :rangeEnd', { rangeEnd })
    .andWhere('lr.endDate >= :rangeStart', { rangeStart });

  if (params.relations?.length) {
    for (const rel of params.relations) {
      qb.leftJoinAndSelect(`lr.${rel}`, rel);
    }
  }

  return qb.getMany();
}

/** Convenience for a single employee and year-bounded restricted-holiday overlap checks. */
export async function findEmployeeLeaveOverlappingRange(
  dataSource: DataSource,
  params: {
    organizationId: string;
    employeeId: string;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<LeaveRequest[]> {
  return findLeaveRequestsOverlappingRange(dataSource, {
    ...params,
    employeeIds: [params.employeeId],
  });
}
