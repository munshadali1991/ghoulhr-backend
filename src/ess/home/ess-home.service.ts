import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LeaveRequest, LeaveRequestStatus } from '../entities/leave-request.entity';
import { EssAttendanceService } from '../attendance/ess-attendance.service';
import { EssHolidaysService } from '../holidays/ess-holidays.service';
import { EssTimesheetService } from '../timesheet/ess-timesheet.service';
import { EssLeaveService } from '../leave/ess-leave.service';
import { AuthorizationService } from '../../rbac/authorization.service';
import { getGreeting } from '../shared/ess-format.util';

const STATIC_HOME = {
  quote: 'Success is not final; failure is not fatal.',
  quickLinks: [
    { label: 'CTC Payslip', href: '#' },
    { label: 'Reimbursement Payslip', href: '#' },
    { label: 'IT Statement', href: '#' },
    { label: 'YTD Reports', href: '#' },
    { label: 'Loan Statement', href: '#' },
  ],
  payslip: { month: 'Apr 2026', paidDays: 30, grossMasked: true },
  itDeclaration: {
    message: 'Hurrah! Considered your IT declaration for Apr 2025.',
    period: 'Apr 2025',
  },
  poi: {
    message:
      'Hold on! You can submit your Proof of Investments (POI) once released.',
  },
};

@Injectable()
export class EssHomeService {
  constructor(
    private readonly attendanceService: EssAttendanceService,
    private readonly holidaysService: EssHolidaysService,
    private readonly timesheetService: EssTimesheetService,
    private readonly leaveService: EssLeaveService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async getHome(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ) {
    const pendingLeaveCount = await dataSource
      .getRepository(LeaveRequest)
      .count({
        where: {
          organizationId,
          employeeId,
          status: LeaveRequestStatus.PENDING,
        },
      });

    const attendance = await this.attendanceService.getTodayStatus(
      dataSource,
      organizationId,
      employeeId,
    );

    const upcomingHolidays = await this.holidaysService.getUpcomingHolidays(
      dataSource,
      organizationId,
      employeeId,
    );

    const timesheet = await this.timesheetService.getTodaySnapshot(
      dataSource,
      organizationId,
      employeeId,
    );

    const authContext = {
      employeeId,
      organizationId,
      tenantDataSource: dataSource,
    };
    const canApproveLeave = await this.authorizationService.hasPermission(
      authContext,
      'approvals.leave:read',
    );
    const pendingApprovalLeaveCount = canApproveLeave
      ? await this.leaveService.countPendingApprovalsForApprover(
          dataSource,
          organizationId,
          employeeId,
        )
      : 0;

    const canApproveTimesheet = await this.authorizationService.hasPermission(
      authContext,
      'approvals.timesheet:read',
    );
    const pendingApprovalTimesheetCount = canApproveTimesheet
      ? await this.timesheetService.countPendingApprovalsForApprover(
          dataSource,
          organizationId,
          employeeId,
        )
      : 0;

    return {
      greeting: getGreeting(),
      quote: STATIC_HOME.quote,
      attendance,
      upcomingHolidays,
      quickLinks: STATIC_HOME.quickLinks,
      payslip: STATIC_HOME.payslip,
      itDeclaration: STATIC_HOME.itDeclaration,
      poi: STATIC_HOME.poi,
      pendingLeaveCount,
      pendingApprovalLeaveCount,
      pendingApprovalTimesheetCount,
      timesheet,
    };
  }
}
