import { BadRequestException, Injectable } from '@nestjs/common';
import {
  addCalendarDays,
  eachCalendarDayInRange,
  isWeekendForOrgDate,
  resolveOrgTimezone,
} from '../../common/utils/org-timezone.util';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';

export interface LeaveDayCalculationInput {
  fromDate: string;
  toDate: string;
  fromSession: string;
  toSession: string;
  policy: LeaveConfiguration;
  /** ISO date keys (YYYY-MM-DD) that are org holidays in range */
  holidayDates?: Set<string>;
  /** IANA timezone from org profile (e.g. Asia/Kolkata); defaults to UTC */
  timezone?: string | null;
}

@Injectable()
export class LeaveDayCalculatorService {
  calculate(input: LeaveDayCalculationInput): number {
    if (input.toDate < input.fromDate) {
      throw new BadRequestException('To date must be on or after from date');
    }

    const timezone = resolveOrgTimezone(input.timezone);
    const allowHalfDay = input.policy.allowHalfDay !== false;
    const dayKeys = eachCalendarDayInRange(input.fromDate, input.toDate);
    let total = 0;

    for (let i = 0; i < dayKeys.length; i += 1) {
      const dateKey = dayKeys[i];
      if (!this.countsAsLeaveDay(dateKey, input.policy, input.holidayDates, timezone)) {
        continue;
      }

      const isSameDay = dayKeys.length === 1;
      const isFirst = i === 0;
      const isLast = i === dayKeys.length - 1;

      total += this.weightForDay(
        isSameDay,
        isFirst,
        isLast,
        input.fromSession,
        input.toSession,
        allowHalfDay,
      );
    }

    return Math.round(total * 100) / 100;
  }

  impliesPartialDay(fromSession: string, toSession: string, fromDate: string, toDate: string): boolean {
    if (fromDate !== toDate) return true;
    const from = this.sessionNumber(fromSession);
    const to = this.sessionNumber(toSession);
    return from === to;
  }

  private weightForDay(
    isSameDay: boolean,
    isFirst: boolean,
    isLast: boolean,
    fromSession: string,
    toSession: string,
    allowHalfDay: boolean,
  ): number {
    if (!allowHalfDay) return 1;

    if (isSameDay) {
      const from = this.sessionNumber(fromSession);
      const to = this.sessionNumber(toSession);
      if (from === to) return 0.5;
      return 1;
    }

    if (isFirst && !isLast) {
      return 0.5;
    }

    if (isLast && !isFirst) {
      return this.sessionNumber(toSession) === 1 ? 0.5 : 1;
    }

    return 1;
  }

  private countsAsLeaveDay(
    dateKey: string,
    policy: LeaveConfiguration,
    holidayDates: Set<string> | undefined,
    timezone: string,
  ): boolean {
    if (
      isWeekendForOrgDate(dateKey, timezone) &&
      !policy.weekendsCountAsLeave
    ) {
      return false;
    }

    if (holidayDates?.has(dateKey) && !policy.holidaysCountAsLeave) {
      return false;
    }

    return true;
  }

  private sessionNumber(session: string): number {
    const s = String(session ?? '').trim().toLowerCase();
    if (s.includes('2')) return 2;
    return 1;
  }

  /** @internal exposed for tests that iterate org-local day keys */
  iterateDays(fromDate: string, toDate: string): string[] {
    return eachCalendarDayInRange(fromDate, toDate);
  }

  /** @internal */
  nextDay(dateKey: string): string {
    return addCalendarDays(dateKey, 1);
  }
}
