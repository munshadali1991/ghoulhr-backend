import { TimesheetDayStatus } from '../entities/timesheet-day.entity';
import {
  TimesheetPriority,
  TimesheetTaskStatus,
  TimesheetWorkType,
} from '../entities/timesheet-entry.entity';

export const TIMESHEET_EDITABLE_STATUSES: TimesheetDayStatus[] = [
  TimesheetDayStatus.DRAFT,
  TimesheetDayStatus.REJECTED,
];

export const TIMESHEET_WORK_TYPES = Object.values(TimesheetWorkType);
export const TIMESHEET_TASK_STATUSES = Object.values(TimesheetTaskStatus);
export const TIMESHEET_PRIORITIES = Object.values(TimesheetPriority);
export const TIMESHEET_DAY_STATUSES = Object.values(TimesheetDayStatus);

export { DEFAULT_TIMESHEET_SETTINGS } from '../../settings/timesheet-settings.defaults';
