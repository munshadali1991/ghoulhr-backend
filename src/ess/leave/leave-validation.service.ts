import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Employee } from '../../employees/employee.entity';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';
import { EmployeeLeaveBalance } from '../entities/employee-leave-balance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveDayCalculatorService } from './leave-day-calculator.service';
import {
  leaveRangesConflict,
  toDateKey,
} from './leave-request-query.util';

@Injectable()
export class LeaveValidationService {
  constructor(private readonly dayCalculator: LeaveDayCalculatorService) {}

  assertCanSubmit(
    policy: LeaveConfiguration,
    balance: EmployeeLeaveBalance,
    daysCount: number,
    dto: CreateLeaveRequestDto,
    hasDocument: boolean,
  ): void {
    const granted = Number(balance.grantedDays);
    const used = Number(balance.usedDays);
    const pending = Number(balance.pendingDays);
    const available = granted - used - pending;

    if (!policy.negativeBalanceAllowed && daysCount > available) {
      throw new BadRequestException(
        'Insufficient leave balance for this leave type',
      );
    }

    if (available <= 0 && !policy.negativeBalanceAllowed && daysCount > 0) {
      throw new BadRequestException(
        'Insufficient leave balance for this leave type',
      );
    }

    if (
      policy.maxConsecutiveDays != null &&
      daysCount > Number(policy.maxConsecutiveDays)
    ) {
      throw new BadRequestException(
        `Request exceeds maximum consecutive days allowed (${policy.maxConsecutiveDays})`,
      );
    }

    const threshold = policy.supportingDocumentAfterDays ?? 0;
    if (
      policy.requiresSupportingDocument &&
      daysCount >= threshold &&
      !hasDocument
    ) {
      throw new BadRequestException(
        'Supporting document is required for this leave duration',
      );
    }

    if (
      !policy.allowHalfDay &&
      this.dayCalculator.impliesPartialDay(
        dto.fromSession,
        dto.toSession,
        dto.fromDate,
        dto.toDate,
      )
    ) {
      throw new BadRequestException(
        'Half-day leave is not allowed for this leave type',
      );
    }
  }

  async assertApproverExists(
    em: EntityManager,
    organizationId: string,
    approverEmployeeId: string,
  ): Promise<Employee> {
    const approver = await em.getRepository(Employee).findOne({
      where: { id: approverEmployeeId },
    });
    if (!approver) {
      throw new BadRequestException('Selected approver is not valid');
    }
    return approver;
  }

  /**
   * Block pending/approved leave that shares any half-day session with the new request.
   * Morning + afternoon on the same day (non-overlapping sessions) remains allowed.
   */
  assertNoOverlappingLeave(
    existing: LeaveRequest[],
    dto: CreateLeaveRequestDto,
  ): void {
    const proposed = {
      startDate: dto.fromDate,
      endDate: dto.toDate,
      startSession: dto.fromSession,
      endSession: dto.toSession,
    };

    for (const row of existing) {
      const conflicts = leaveRangesConflict(proposed, {
        startDate: toDateKey(row.startDate),
        endDate: toDateKey(row.endDate),
        startSession: row.startSession,
        endSession: row.endSession,
      });
      if (conflicts) {
        throw new BadRequestException(
          'You already have a pending or approved leave request overlapping these dates',
        );
      }
    }
  }
}
