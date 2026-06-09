# Tenant Data Dictionary

## Core (`core` schema)

- `employees`: canonical employee profile and assignment FKs (`departmentId`, `designationId`).
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
- `timesheet_days`: daily timesheet header per employee (`workDate`, `status`, `totalHours`, approval fields).
- `timesheet_categories`: org-scoped master for employee timesheet category dropdown (`name`, `isActive`, `sortOrder`).
- `timesheet_entries`: line-item work logs linked to `timesheet_days` (`categoryId` → `timesheet_categories`, project name, task, hours, task status, priority).

### Timesheet configuration (via `organization_settings` keys)

- `timesheet.max_hours_per_day`: daily hour cap for submissions (default 12).
- `timesheet.max_past_days`: how far back employees may log entries (default 7).
- `timesheet.require_submission_by_eod`: home dashboard reminder toggle.
- `timesheet.employee_helper_text`: guidance shown on My Timesheet.
- `timesheet.week_starts_on`: week start for reports (0 = Sunday, 1 = Monday).

## Audit (`audit` schema)

- `employee_audit_logs`: actor/action metadata for employee operations.

## Utility Views

- `vw_employee_profile`: denormalized read model for employee list/profile joins.
