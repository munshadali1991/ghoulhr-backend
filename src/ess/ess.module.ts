import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailModule } from '../modules/email';
import { FieldEncryptionService } from '../common/services/field-encryption.service';
import { EssAttendanceController } from './attendance/ess-attendance.controller';
import { EssAttendanceService } from './attendance/ess-attendance.service';
import { EssLeaveCalendarController } from './calendar/ess-leave-calendar.controller';
import { EssLeaveCalendarService } from './calendar/ess-leave-calendar.service';
import { EssHolidaysController } from './holidays/ess-holidays.controller';
import { EssHolidaysService } from './holidays/ess-holidays.service';
import { EssHomeController } from './home/ess-home.controller';
import { EssHomeService } from './home/ess-home.service';
import { EssLeaveController } from './leave/ess-leave.controller';
import { EssLeaveService } from './leave/ess-leave.service';
import { LeaveBalanceService } from './leave/leave-balance.service';
import { LeaveDayCalculatorService } from './leave/leave-day-calculator.service';
import { LeavePolicyService } from './leave/leave-policy.service';
import { LeaveValidationService } from './leave/leave-validation.service';
import { LeaveNotificationService } from './leave/leave-notification.service';
import { EssNotificationsController } from './notifications/ess-notifications.controller';
import { EssNotificationsService } from './notifications/ess-notifications.service';
import { EssTimesheetController } from './timesheet/ess-timesheet.controller';
import { EssTimesheetService } from './timesheet/ess-timesheet.service';
import { EssApprovalsController } from './approvals/ess-approvals.controller';

@Module({
  imports: [EmployeesModule, SettingsModule, EmailModule],
  controllers: [
    EssLeaveController,
    EssLeaveCalendarController,
    EssHolidaysController,
    EssAttendanceController,
    EssHomeController,
    EssNotificationsController,
    EssTimesheetController,
    EssApprovalsController,
  ],
  providers: [
    EssLeaveService,
    EssLeaveCalendarService,
    EssHolidaysService,
    EssAttendanceService,
    EssHomeService,
    EssNotificationsService,
    EssTimesheetService,
    LeavePolicyService,
    LeaveBalanceService,
    LeaveDayCalculatorService,
    LeaveValidationService,
    LeaveNotificationService,
    FieldEncryptionService,
  ],
})
export class EssModule {}
