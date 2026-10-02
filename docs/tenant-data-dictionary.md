# Tenant Data Dictionary

## Core (`core` schema)

- `employees`: canonical employee profile and assignment FKs (`departmentId`, `designationId`); optional `biometricId` integer PIN for wall devices (not a biometric template).
- `refresh_sessions`: employee session tracking (existing, if enabled in tenant modules).
- `employee_access_control`: employee portal access controls.

## Master (`master` schema)

- `departments`: active department list for tenant.
- `designations`: active designation list for tenant.
- `designation_departments`: allowed designation-to-department combinations.

## Config (`config` schema)

- `settings_catalog`: allowed setting keys and value metadata.
- `tenant_settings`: tenant values bound to catalog keys.
- `organization_settings`: compatibility key-value store retained for legacy read/write paths.

## Feature (`feature` schema)

- `employee_employment_details`: employment metadata (type, status, HR manager reference, work mode, etc.).
- `employee_reporting_managers`: primary reporting-manager assignments per employee (history via `effectiveTo`).
- `employee_salary_details`: salary summary and flags.
- `employee_bank_details`: encrypted bank account data.
- `employee_documents`: uploaded onboarding documents and verification state.
- `employee_emergency_contacts`: emergency contacts.
- `biometric_devices`: wall-mounted attendance device registry (`serialNumber`, `status`, `locationId`, `lastSeenAt`, optional `commKeyHash`).
- `biometric_unmapped_punches`: device punches whose hardware PIN is not yet mapped to an employee.
- `attendance_punches` (extended): optional `deviceId`, `deviceSerial`, `hardwareUserId`, `externalEventKey` for biometric sources.
- `timesheet_days`: daily timesheet header per employee (`workDate`, `status`, `totalHours`, approval fields).
- `timesheet_categories`: org-scoped master for employee timesheet category dropdown (`name`, `isActive`, `sortOrder`).
- `timesheet_entries`: line-item work logs linked to `timesheet_days` (`categoryId` → `timesheet_categories`, project name, task, hours, task status, priority).

### Biometric / attendance device settings (via `organization_settings` keys)

- `attendance.punch_direction_mode`: `smart_shift` (default) or `strict`.
- `attendance.biometric_dedupe_window_seconds`: discard duplicate device scans within window (default 120).

### Timesheet configuration (via `organization_settings` keys)

- `timesheet.max_hours_per_day`: daily hour cap for submissions (default 12).
- `timesheet.max_past_days`: how far back employees may log entries (default 7).
- `timesheet.require_submission_by_eod`: home dashboard reminder toggle.
- `timesheet.employee_helper_text`: guidance shown on My Timesheet.
- `timesheet.week_starts_on`: week start for reports (0 = Sunday, 1 = Monday).

### Expense claims

- `expense_categories`: org-scoped expense category master (`code`, `name`, `isActive`, `receiptRequiredAboveAmount`, optional `maxAmountPerLine` / `claimWindowDays`).
- `expense_claims`: claim header (`claimNumber`, `status`, `currency`, `totalAmount`, manager/finance actors, rejection/send-back, settlement fields).
- `expense_claim_lines`: line items (`lineNo`, `categoryId`, `expenseDate`, `merchant`, `amount`, optional `receiptDocumentId`).
- Status flow: `DRAFT` → `PENDING_MANAGER` → `PENDING_FINANCE` → `APPROVED` → `PAID` (also `SENT_BACK`, `REJECTED`, `WITHDRAWN`).

### Expense configuration (via `organization_settings` keys)

- `expense.default_claim_window_days`: max age of expense dates at submit (default 90).
- `expense.max_lines_per_claim`: line cap per claim (default 50).
- `expense.max_claim_amount`: hard total cap (default 500000).

## Audit (`audit` schema)

- `employee_audit_logs`: actor/action metadata for employee operations.
- `biometric_audit_logs`: device CRUD, biometric ID mapping, and unmapped punch resolution.
- `expense_claim_audit_logs`: append-only expense claim transition trail (`action`, `fromStatus`, `toStatus`, `payloadJson`).

## Utility Views

- `vw_employee_profile`: denormalized read model for employee list/profile joins.
