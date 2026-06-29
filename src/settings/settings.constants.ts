export const SETTING_KEYS = {
  ORG_NAME: 'org.name',
  ORG_LOGO: 'org.logo',
  ORG_TIMEZONE: 'org.timezone',
  ORG_CURRENCY: 'org.currency',
  ORG_DATE_FORMAT: 'org.date_format',
  ORG_LANGUAGE: 'org.language',
  ORG_FINANCIAL_YEAR_START_MONTH: 'org.financial_year_start_month',
  EMPLOYEE_ID_PREFIX: 'employee.id_prefix',
  EMPLOYEE_AUTO_GENERATE_ID: 'employee.auto_generate_id',
  EMPLOYEE_REQUIRED_FIELDS: 'employee.required_fields',
  EMPLOYEE_DEFAULT_PROBATION_PERIOD: 'employee.default_probation_period',
  EMPLOYEE_DEPARTMENTS: 'employee.departments',
  EMPLOYEE_DESIGNATIONS: 'employee.designations',
  ATTENDANCE_WORKING_DAYS: 'attendance.working_days',
  ATTENDANCE_SHIFTS: 'attendance.shifts',
  ATTENDANCE_GRACE_PERIOD: 'attendance.grace_period_minutes',
  ATTENDANCE_HALF_DAY_THRESHOLD: 'attendance.half_day_threshold_minutes',
  ATTENDANCE_OVERTIME_ENABLED: 'attendance.overtime_enabled',
  ATTENDANCE_OVERTIME_RULES: 'attendance.overtime_rules',
  ATTENDANCE_TRACKING_MODE: 'attendance.tracking_mode',
  ATTENDANCE_GEO_FENCING_ENABLED: 'attendance.geo_fencing_enabled',
  ATTENDANCE_ALLOWED_IPS: 'attendance.allowed_ip_addresses',
  TIMESHEET_MAX_HOURS_PER_DAY: 'timesheet.max_hours_per_day',
  TIMESHEET_MAX_PAST_DAYS: 'timesheet.max_past_days',
  TIMESHEET_REQUIRE_SUBMISSION_BY_EOD: 'timesheet.require_submission_by_eod',
  TIMESHEET_EMPLOYEE_HELPER_TEXT: 'timesheet.employee_helper_text',
  TIMESHEET_WEEK_STARTS_ON: 'timesheet.week_starts_on',
} as const;

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;

export const SUPPORTED_TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Singapore',
  'Australia/Sydney',
] as const;

export const SUPPORTED_DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD-MM-YYYY',
] as const;

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'es', 'fr'] as const;

export const SUPPORTED_FY_START_MONTHS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const;

export const ALLOWED_EMPLOYEE_FIELDS = [
  'name',
  'email',
  'phone',
  'department',
  'position',
  'hire_date',
  'salary',
  'address',
  'emergency_contact',
] as const;

export const VALID_WEEKDAYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const;

export const VALID_TRACKING_MODES = [
  'manual',
  'biometric',
  'geo',
  'ip',
] as const;
