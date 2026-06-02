import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';
import { EmployeeLeaveBalance } from '../entities/employee-leave-balance.entity';
import {
  LeaveRequest,
  LeaveRequestStatus,
} from '../entities/leave-request.entity';

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

@Injectable()
export class LeaveBalanceService {
  async ensureBalancesForYear(
    em: EntityManager | DataSource,
    organizationId: string,
    employeeId: string,
    year: number,
    policies: LeaveConfiguration[],
  ): Promise<EmployeeLeaveBalance[]> {
    const repo = em.getRepository(EmployeeLeaveBalance);
    const results: EmployeeLeaveBalance[] = [];

    for (const policy of policies) {
      let row = await repo.findOne({
        where: {
          organizationId,
          employeeId,
          leaveConfigurationId: policy.id,
          year,
        },
      });

      if (!row) {
        row = await repo.save(
          repo.create({
            organizationId,
            employeeId,
            leaveConfigurationId: policy.id,
            year,
            grantedDays: String(policy.annualEntitlementDays ?? 0),
            usedDays: '0',
            pendingDays: '0',
          }),
        );
      }

      results.push(row);
    }

    return results;
  }

  async getOrCreateBalance(
    em: EntityManager,
    organizationId: string,
    employeeId: string,
    leaveConfigurationId: string,
    year: number,
    policy: LeaveConfiguration,
  ): Promise<EmployeeLeaveBalance> {
    const repo = em.getRepository(EmployeeLeaveBalance);
    let row = await repo.findOne({
      where: {
        organizationId,
        employeeId,
        leaveConfigurationId,
        year,
      },
    });

    if (!row) {
      row = await repo.save(
        repo.create({
          organizationId,
          employeeId,
          leaveConfigurationId,
          year,
          grantedDays: String(policy.annualEntitlementDays ?? 0),
          usedDays: '0',
          pendingDays: '0',
        }),
      );
    }

    return row;
  }

  roundDays(value: number): number {
    return Math.round(value * 100) / 100;
  }

  computeAvailableBalance(
    granted: number,
    consumed: number,
    pending: number,
  ): number {
    return this.roundDays(granted - consumed - pending);
  }

  mapBalanceToApi(
    policy: LeaveConfiguration,
    balance: EmployeeLeaveBalance,
  ) {
    const granted = Number(balance.grantedDays);
    const consumed = Number(balance.usedDays);
    const pending = Number(balance.pendingDays);
    const available = this.computeAvailableBalance(granted, consumed, pending);

    return {
      id: policy.id,
      name: policy.name,
      granted,
      consumed,
      pending,
      balance: available,
    };
  }

  async computeOpeningBalance(
    em: EntityManager | DataSource,
    organizationId: string,
    employeeId: string,
    policy: LeaveConfiguration,
    year: number,
  ): Promise<number> {
    if (!policy.allowCarryForward) {
      return 0;
    }

    const prevYear = year - 1;
    const repo = em.getRepository(EmployeeLeaveBalance);
    const prevRow = await repo.findOne({
      where: {
        organizationId,
        employeeId,
        leaveConfigurationId: policy.id,
        year: prevYear,
      },
    });

    if (!prevRow) {
      return 0;
    }

    const granted = Number(prevRow.grantedDays);
    const consumed = Number(prevRow.usedDays);
    const pending = Number(prevRow.pendingDays);
    return this.computeAvailableBalance(granted, consumed, pending);
  }

  /**
   * Approved leave days consumed per calendar month (1–12) for the given year.
   */
  buildMonthlyConsumed(
    requests: LeaveRequest[],
    year: number,
  ): number[] {
    const monthly = Array.from({ length: 12 }, () => 0);

    for (const row of requests) {
      if (row.status !== LeaveRequestStatus.APPROVED) {
        continue;
      }
      const startDate = this.toDateString(row.startDate);
      const [y, m] = startDate.split('-').map(Number);
      if (y !== year || !m) {
        continue;
      }
      monthly[m - 1] += Number(row.daysCount);
    }

    return monthly.map((d) => this.roundDays(d));
  }

  /**
   * Running balance per month: opening + cumulative grants − cumulative consumed.
   * MONTHLY accrual spreads annual entitlement across 12 months; otherwise grant in January only.
   */
  buildMonthlyChart(
    policy: LeaveConfiguration,
    openingBalance: number,
    monthlyConsumed: number[],
    year: number,
  ) {
    const annual = Number(policy.annualEntitlementDays ?? 0);
    const isMonthlyAccrual =
      (policy.accrualType ?? 'MONTHLY').toUpperCase() === 'MONTHLY';
    const monthlyGrant = isMonthlyAccrual ? annual / 12 : 0;
    const yearSuffix = String(year).slice(-2);

    let cumulativeGrant = 0;
    let cumulativeConsumed = 0;

    return monthlyConsumed.map((consumed, index) => {
      const month = index + 1;
      const grantThisMonth =
        isMonthlyAccrual ? monthlyGrant : month === 1 ? annual : 0;
      cumulativeGrant += grantThisMonth;
      cumulativeConsumed += consumed;
      const balance = this.roundDays(
        openingBalance + cumulativeGrant - cumulativeConsumed,
      );

      return {
        month,
        label: `${MONTH_SHORT[index]} ${yearSuffix}`,
        balance,
        consumed,
      };
    });
  }

  mapRequestToLedgerTransaction(row: LeaveRequest) {
    const transactionType = this.mapStatusToTransactionType(row.status);
    const fromDate = this.toDateString(row.startDate);
    const toDate = this.toDateString(row.endDate);
    const postedOn = this.resolvePostedOn(row);

    return {
      id: row.id,
      transactionType,
      postedOn,
      fromDate,
      fromSession: row.startSession,
      toDate,
      toSession: row.endSession,
      days: Number(row.daysCount),
      reason: row.reason ?? undefined,
      remarks: null as string | null,
      expiryDate: null as string | null,
    };
  }

  private mapStatusToTransactionType(status: LeaveRequestStatus): string {
    switch (status) {
      case LeaveRequestStatus.PENDING:
        return 'Application - Pending';
      case LeaveRequestStatus.APPROVED:
        return 'Application - Approved';
      case LeaveRequestStatus.REJECTED:
        return 'Application - Rejected';
      case LeaveRequestStatus.WITHDRAWN:
        return 'Application - Withdrawn';
      default:
        return `Application - ${status}`;
    }
  }

  private resolvePostedOn(row: LeaveRequest): string | null {
    if (row.status === LeaveRequestStatus.APPROVED) {
      return row.updatedAt.toISOString().slice(0, 10);
    }
    if (
      row.status === LeaveRequestStatus.PENDING ||
      row.status === LeaveRequestStatus.REJECTED ||
      row.status === LeaveRequestStatus.WITHDRAWN
    ) {
      return this.toDateString(row.appliedOn);
    }
    return null;
  }

  private toDateString(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  incrementPending(
    balance: EmployeeLeaveBalance,
    daysCount: number,
  ): void {
    const pending = Number(balance.pendingDays) + daysCount;
    balance.pendingDays = String(Math.round(pending * 100) / 100);
  }

  decrementPending(
    balance: EmployeeLeaveBalance,
    daysCount: number,
  ): void {
    const pending = Math.max(0, Number(balance.pendingDays) - daysCount);
    balance.pendingDays = String(Math.round(pending * 100) / 100);
  }
}
