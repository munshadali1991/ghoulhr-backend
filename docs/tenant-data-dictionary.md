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

- `employee_employment_details`: employment metadata and manager references.
- `employee_salary_details`: salary summary and flags.
- `employee_bank_details`: encrypted bank account data.
- `employee_documents`: uploaded onboarding documents and verification state.
- `employee_emergency_contacts`: emergency contacts.
## Audit (`audit` schema)

- `employee_audit_logs`: actor/action metadata for employee operations.

## Utility Views

- `vw_employee_profile`: denormalized read model for employee list/profile joins.
