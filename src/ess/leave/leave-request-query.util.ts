import { DataSource } from 'typeorm';
import { eachCalendarDayInRange } from '../../common/utils/org-timezone.util';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../entities/leave-request.entity';

const ACTIVE_LEAVE_STATUSES = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
];

/** Civil YYYY-MM-DD for string dates or Date values from DATE columns (UTC midnight). */
export function toDateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sessionNumber(session: string | null | undefined): 1 | 2 {
  const s = String(session ?? '').trim().toLowerCase();
  if (s.includes('2')) return 2;
  return 1;
}

/**
 * Sessions (1 = first half, 2 = second half) covered by a leave row on a given day.
 * Aligns with LeaveDayCalculatorService half-day weighting for first/last/middle days.
 */
export function sessionsCoveredOnDay(
  startDate: string,
  endDate: string,
  startSession: string | null | undefined,
  endSession: string | null | undefined,
  dayKey: string,
): Set<1 | 2> {
  if (dayKey < startDate || dayKey > endDate) {
    return new Set();
  }

  if (startDate === endDate) {
    const from = sessionNumber(startSession);
    const to = sessionNumber(endSession);
    if (from === to) return new Set([from]);
    return new Set([1, 2]);
  }

  if (dayKey === startDate) {
    return new Set([sessionNumber(startSession)]);
  }

  if (dayKey === endDate) {
    return sessionNumber(endSession) === 1 ? new Set([1]) : new Set([1, 2]);
  }

  return new Set([1, 2]);
}

/** True when two leave ranges share any calendar session (half-day aware). */
export function leaveRangesConflict(a: {
  startDate: string;
  endDate: string;
  startSession?: string | null;
  endSession?: string | null;
}, b: {
  startDate: string;
  endDate: string;
  startSession?: string | null;
  endSession?: string | null;
}): boolean {
  const rangeStart = a.startDate < b.startDate ? b.startDate : a.startDate;
  const rangeEnd = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (rangeStart > rangeEnd) return false;

  for (const day of eachCalendarDayInRange(rangeStart, rangeEnd)) {
    const aSessions = sessionsCoveredOnDay(
      a.startDate,
      a.endDate,
      a.startSession,
      a.endSession,
      day,
    );
    const bSessions = sessionsCoveredOnDay(
      b.startDate,
      b.endDate,
      b.startSession,
      b.endSession,
      day,
    );
    for (const s of aSessions) {
      if (bSessions.has(s)) return true;
    }
  }
  return false;
}

/** Leave rows overlapping [rangeStart, rangeEnd] (inclusive ISO dates). */
export async function findLeaveRequestsOverlappingRange(
  dataSource: DataSource,
  params: {
    organizationId: string;
    /** null = all employees in org; empty array = no rows */
    employeeIds: string[] | null;
    rangeStart: string;
    rangeEnd: string;
    statuses?: LeaveRequestStatus[];
    relations?: string[];
  },
): Promise<LeaveRequest[]> {
  const { organizationId, employeeIds, rangeStart, rangeEnd } = params;
  if (employeeIds !== null && employeeIds.length === 0) return [];

  const statuses = params.statuses ?? ACTIVE_LEAVE_STATUSES;

  const qb = dataSource
    .getRepository(LeaveRequest)
    .createQueryBuilder('lr')
    .where('lr.organizationId = :organizationId', { organizationId })
    .andWhere('lr.status IN (:...statuses)', { statuses })
    .andWhere('lr.startDate <= :rangeEnd', { rangeEnd })
    .andWhere('lr.endDate >= :rangeStart', { rangeStart });

  if (employeeIds !== null) {
    qb.andWhere('lr.employeeId IN (:...employeeIds)', { employeeIds });
  }

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
