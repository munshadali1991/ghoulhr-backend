# Database schema

peopleAIQ uses two PostgreSQL roles for data.

| Database | How it is opened | What lives here |
| --- | --- | --- |
| **Master** | Nest root connection. `database.config.ts` reads `DB_NAME`. `DatabaseModule` runs migrations from `dist/src/migrations/*.js` (files directly under `src/migrations/`, not the `tenant/` folder). | Platform identity: organizations, users, subscriptions, module entitlements, auth sessions, marketing leads. |
| **Tenant** | One database per organization. `Organization.dbName` (optional `dbHost` / `dbUser` / `dbPassword`) is opened by `TenantConnectionManager`. Migrations come from `src/migrations/tenant/`. | That company’s employees, ESS, attendance, timesheets, skills, documents, settings, and tenant RBAC. |

`autoLoadEntities` on the master connection only registers entities passed to `TypeOrmModule.forFeature`. Tenant entity classes are attached only on the per-tenant `DataSource` in `tenant-connection.manager.ts`. `PlatformModule` and `OrganizationModuleEntitlement` stay on the master connection and are deliberately excluded from the tenant entity list.

There is **no PostgreSQL foreign key across the two databases**. A tenant `organizationId` column stores `organizations.id` from the master database, but Postgres cannot enforce it. Real foreign keys exist only inside one database and are the `@JoinColumn` relations below.

Almost every entity extends `BaseEntity`: `id uuid` primary key, `createdAt`, `updatedAt`, and soft-delete `deletedAt`. Exceptions are called out on the diagram (`contact_us`, `request_for_demo`, `refresh_sessions`, `auth_handoff_tokens`, `designation_departments`).

```mermaid
flowchart LR
  subgraph masterDb [Master database]
    ORG[organizations]
    USR[users]
    SUB[organization_subscriptions]
    ENT[organization_module_entitlements]
    REF[refresh_sessions]
  end
  subgraph tenantDb [Tenant database named by organizations.dbName]
    EMP[employees and ESS tables]
  end
  ORG -->|"dbName selects this database"| tenantDb
  ORG -.->|"organizationId copied onto tenant rows, not a FK"| EMP
  REF -.->|"employeeId points at tenant employees.id, not a FK"| EMP
```

---

## Master database

Registered on the root connection:

| Entity | Table | Isolation |
| --- | --- | --- |
| `Organization` | `organizations` | Root tenant record. `subdomain` is unique. `dbName` names the tenant database. |
| `User` | `users` | `organizationId` FK, cascade delete. Unique `(email, organizationId)`. Platform users, including super admin. |
| `OrganizationSubscription` | `organization_subscriptions` | `organizationId` FK, cascade delete. `createdByUserId` is a uuid with **no** FK to `users`. |
| `PlatformModule` | `platform_modules` | Global catalog. `code` is unique. No organization column. |
| `OrganizationModuleEntitlement` | `organization_module_entitlements` | `organizationId` FK, cascade delete. Unique `(organizationId, moduleCode)`. `moduleCode` matches `platform_modules.code` in application code, not as a database FK. |
| `RefreshSession` | `refresh_sessions` | `organizationId` FK to `organizations` (nullable, cascade). `masterUserId` FK to `users` (nullable, cascade). `employeeId` is a nullable uuid with **no** FK, because the employee row is in the tenant database. `sessionKind` is `master` or `employee`. |
| `AuthHandoffToken` | `auth_handoff_tokens` | `refreshSessionId` FK, cascade delete. |
| `ContactUs` | `contact_us` | Marketing inbox. No organization FK. `id` is bigint. |
| `RequestForDemo` | `request_for_demo` | Marketing inbox. No organization FK. `id` is bigint. |

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ USERS : "organizationId CASCADE"
  ORGANIZATIONS ||--o{ ORGANIZATION_SUBSCRIPTIONS : "organizationId CASCADE"
  ORGANIZATIONS ||--o{ ORGANIZATION_MODULE_ENTITLEMENTS : "organizationId CASCADE"
  ORGANIZATIONS ||--o{ REFRESH_SESSIONS : "organizationId CASCADE"
  USERS ||--o{ REFRESH_SESSIONS : "masterUserId CASCADE"
  REFRESH_SESSIONS ||--o{ AUTH_HANDOFF_TOKENS : "refreshSessionId CASCADE"

  ORGANIZATIONS {
    uuid id PK
    string subdomain UK
    string name
    enum status
    string dbName "tenant database name"
    string dbHost
    string dbUser
    string dbPassword
    int org_port UK
    numeric monthlySubscriptionAmount
  }

  USERS {
    uuid id PK
    uuid organizationId FK
    string email "unique with organizationId"
    string password
    enum role
    enum status
    timestamptz deletedAt "soft delete"
  }

  ORGANIZATION_SUBSCRIPTIONS {
    uuid id PK
    uuid organizationId FK
    enum subscriptionType
    timestamptz startsAt
    timestamptz expiresAt
    enum status
    uuid createdByUserId "logical user id, no FK"
  }

  PLATFORM_MODULES {
    uuid id PK
    string code UK
    string name
    boolean isActive
    int sortOrder
  }

  ORGANIZATION_MODULE_ENTITLEMENTS {
    uuid id PK
    uuid organizationId FK
    string moduleCode "logical platform_modules.code"
    boolean enabled
    uuid enabledBy
    timestamptz expiresAt
  }

  REFRESH_SESSIONS {
    uuid id PK
    string tokenHash UK
    string sessionKind "master or employee"
    uuid masterUserId FK
    uuid organizationId FK
    uuid employeeId "logical tenant employees.id, no FK"
    timestamptz expiresAt
    timestamptz absoluteExpiresAt
    timestamptz revokedAt
    uuid replacedBySessionId
  }

  AUTH_HANDOFF_TOKENS {
    uuid id PK
    string tokenHash UK
    uuid refreshSessionId FK
    string targetSubdomain
    timestamptz expiresAt
    timestamptz consumedAt
  }

  CONTACT_US {
    bigint id PK
    string name
    string email
    string company
    string company_size
    text message
    timestamptz created_at
  }

  REQUEST_FOR_DEMO {
    bigint id PK
    string org_name
    string work_email
    string country
    string city
    string employee_size
    string company_type
    timestamptz created_at
  }
```

`PLATFORM_MODULES` is not drawn with a line to entitlements: the link is `moduleCode`, not a foreign key.

---

## Tenant database

Each tenant database is already one company. `organizationId` on a tenant row is a second isolation field: queries filter by it, and indexes usually lead with it. It is **not** a foreign key to master `organizations`.

Tables that do **not** declare `organizationId` are still tenant-scoped because they only exist inside that database. They hang off a parent row (`employeeId`, `timesheetDayId`, `assessmentId`, `dailySummaryId`, and so on).

Child tables with no `organizationId` column:

`employee_employment_details`, `employee_salary_details`, `employee_bank_details`, `employee_emergency_contacts`, `employee_access_control`, `employee_documents`, `employee_audit_logs`, `employee_reporting_managers`, `work_shift_sessions`, `timesheet_entries`, `attendance_sessions`, `performance_answers`, `leave_request_cc_recipients`, `organization_settings`, and the tenant RBAC tables (`rbac_roles`, `rbac_permissions`, `rbac_role_permissions`, `rbac_employee_role_assignments`, `rbac_permission_audit_logs`).

`rbac_permissions.moduleCode` is a string aligned with master `platform_modules.code`. It is not a foreign key.

### Employees, org structure, and onboarding documents

```mermaid
erDiagram
  DEPARTMENTS ||--o{ DESIGNATION_DEPARTMENTS : "departmentId CASCADE"
  DESIGNATIONS ||--o{ DESIGNATION_DEPARTMENTS : "designationId CASCADE"
  DEPARTMENTS ||--o{ EMPLOYEES : "departmentId SET NULL"
  DESIGNATIONS ||--o{ EMPLOYEES : "designationId SET NULL"
  LOCATIONS_CONFIGURATIONS ||--o{ WORK_SHIFT_CONFIGURATIONS : "locationId RESTRICT"
  WORK_SHIFT_CONFIGURATIONS ||--o{ WORK_SHIFT_SESSIONS : "shiftConfigurationId CASCADE"
  EMPLOYEES ||--|| EMPLOYEE_EMPLOYMENT_DETAILS : "employeeId CASCADE"
  EMPLOYEES ||--|| EMPLOYEE_SALARY_DETAILS : "employeeId CASCADE"
  EMPLOYEES ||--|| EMPLOYEE_BANK_DETAILS : "employeeId CASCADE"
  EMPLOYEES ||--|| EMPLOYEE_EMERGENCY_CONTACTS : "employeeId CASCADE"
  EMPLOYEES ||--|| EMPLOYEE_ACCESS_CONTROL : "employeeId CASCADE"
  EMPLOYEES ||--o{ EMPLOYEE_DOCUMENTS : "employeeId CASCADE"
  EMPLOYEES ||--o{ EMPLOYEE_AUDIT_LOGS : "employeeId SET NULL"
  EMPLOYEES ||--o{ EMPLOYEE_REPORTING_MANAGERS : "employeeId CASCADE"
  EMPLOYEES ||--o{ EMPLOYEE_REPORTING_MANAGERS : "managerEmployeeId RESTRICT"

  DEPARTMENTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    string name
  }

  DESIGNATIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    string name
  }

  DESIGNATION_DEPARTMENTS {
    uuid organizationId "tenant isolation"
    uuid designationId PK_FK
    uuid departmentId PK_FK
  }

  LOCATIONS_CONFIGURATIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    int sortOrder
  }

  WORK_SHIFT_CONFIGURATIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid locationId FK
  }

  WORK_SHIFT_SESSIONS {
    uuid id PK
    uuid shiftConfigurationId FK
  }

  EMPLOYEES {
    uuid id PK
    uuid organizationId "tenant isolation"
    string employeeCode UK
    int biometricId "matched to device punches"
    uuid departmentId FK
    uuid designationId FK
    string email
    enum role
    enum status
  }

  EMPLOYEE_EMPLOYMENT_DETAILS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_SALARY_DETAILS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_BANK_DETAILS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_EMERGENCY_CONTACTS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_ACCESS_CONTROL {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_DOCUMENTS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_AUDIT_LOGS {
    uuid id PK
    uuid employeeId FK
  }

  EMPLOYEE_REPORTING_MANAGERS {
    uuid id PK
    uuid employeeId FK
    uuid managerEmployeeId FK
  }
```

`employee_documents` is the onboarding file store (S3 key or legacy inline bytes). The Document Centre library is a different pair of tables, below.

### Leave and holidays

`organization_calendar_holidays.locationId` is a nullable uuid aimed at `locations_configurations`. The entity does not declare `@ManyToOne`, so it is not a database foreign key.

```mermaid
erDiagram
  LOCATIONS_CONFIGURATIONS ||--o{ LEAVE_CONFIGURATIONS : "locationId RESTRICT"
  LEAVE_CONFIGURATIONS ||--o{ EMPLOYEE_LEAVE_BALANCES : "leaveConfigurationId RESTRICT"
  LEAVE_CONFIGURATIONS ||--o{ LEAVE_REQUESTS : "leaveConfigurationId RESTRICT"
  EMPLOYEES ||--o{ EMPLOYEE_LEAVE_BALANCES : "employeeId CASCADE"
  EMPLOYEES ||--o{ LEAVE_REQUESTS : "employeeId CASCADE"
  EMPLOYEES ||--o{ LEAVE_REQUESTS : "approverEmployeeId SET NULL"
  EMPLOYEES ||--o{ LEAVE_ATTACHMENTS : "employeeId CASCADE"
  LEAVE_ATTACHMENTS ||--o{ LEAVE_REQUESTS : "supportingDocumentId SET NULL"
  LEAVE_REQUESTS ||--o{ LEAVE_REQUEST_CC_RECIPIENTS : "leaveRequestId CASCADE"
  EMPLOYEES ||--o{ LEAVE_REQUEST_CC_RECIPIENTS : "employeeId CASCADE"
  ORGANIZATION_CALENDARS ||--o{ ORGANIZATION_CALENDAR_HOLIDAYS : "calendarId CASCADE"

  LEAVE_CONFIGURATIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid locationId FK
    string name
    string code
  }

  EMPLOYEE_LEAVE_BALANCES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid leaveConfigurationId FK
    int year
  }

  LEAVE_REQUESTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid leaveConfigurationId FK
    uuid approverEmployeeId FK
    uuid supportingDocumentId FK
    string status
    date startDate
    date endDate
    numeric days
  }

  LEAVE_ATTACHMENTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    string storageKey
  }

  LEAVE_REQUEST_CC_RECIPIENTS {
    uuid id PK
    uuid leaveRequestId FK
    uuid employeeId FK
  }

  ORGANIZATION_CALENDARS {
    uuid id PK
    uuid organizationId "tenant isolation"
    smallint year
    string status
  }

  ORGANIZATION_CALENDAR_HOLIDAYS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid calendarId FK
    uuid locationId "logical locations_configurations.id"
    date holidayDate
    string name
  }
```

### Attendance and biometric devices

`attendance_punches.deviceId` stores a device id when the punch came from hardware. The punch entity does not declare a foreign key to `biometric_devices`.

```mermaid
erDiagram
  LOCATIONS_CONFIGURATIONS ||--o{ BIOMETRIC_DEVICES : "locationId SET NULL"
  EMPLOYEES ||--o{ ATTENDANCE_PUNCHES : "employeeId CASCADE"
  EMPLOYEES ||--o{ ATTENDANCE_DAILY_SUMMARIES : "employeeId CASCADE"
  WORK_SHIFT_CONFIGURATIONS ||--o{ ATTENDANCE_DAILY_SUMMARIES : "shiftConfigurationId SET NULL"
  ATTENDANCE_DAILY_SUMMARIES ||--o{ ATTENDANCE_SESSIONS : "dailySummaryId CASCADE"
  EMPLOYEES ||--o{ ATTENDANCE_REGULARIZATION_REQUESTS : "employeeId CASCADE"
  EMPLOYEES ||--o{ ATTENDANCE_REGULARIZATION_REQUESTS : "approverEmployeeId SET NULL"
  BIOMETRIC_DEVICES ||--o{ BIOMETRIC_UNMAPPED_PUNCHES : "deviceId SET NULL"
  EMPLOYEES ||--o{ BIOMETRIC_UNMAPPED_PUNCHES : "resolvedEmployeeId SET NULL"
  EMPLOYEES ||--o{ BIOMETRIC_AUDIT_LOGS : "actorEmployeeId SET NULL"

  BIOMETRIC_DEVICES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid locationId FK
    string serialNumber
    string status
  }

  BIOMETRIC_UNMAPPED_PUNCHES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid deviceId FK
    int biometricId
    uuid resolvedEmployeeId FK
    string status
    timestamptz eventTimestamp
  }

  BIOMETRIC_AUDIT_LOGS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid actorEmployeeId FK
    string action
  }

  ATTENDANCE_PUNCHES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid deviceId "logical biometric_devices.id"
    string punchType
    string source
    timestamptz punchedAt
  }

  ATTENDANCE_DAILY_SUMMARIES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid shiftConfigurationId FK
    date workDate "unique with employee"
  }

  ATTENDANCE_SESSIONS {
    uuid id PK
    uuid dailySummaryId FK
  }

  ATTENDANCE_REGULARIZATION_REQUESTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid approverEmployeeId FK
    string status
  }
```

### Timesheets

```mermaid
erDiagram
  EMPLOYEES ||--o{ TIMESHEET_DAYS : "employeeId CASCADE"
  EMPLOYEES ||--o{ TIMESHEET_DAYS : "approverEmployeeId SET NULL"
  TIMESHEET_DAYS ||--o{ TIMESHEET_ENTRIES : "timesheetDayId CASCADE"
  TIMESHEET_CATEGORIES ||--o{ TIMESHEET_ENTRIES : "categoryId RESTRICT"

  TIMESHEET_CATEGORIES {
    uuid id PK
    uuid organizationId "tenant isolation"
    string name
    int sortOrder
  }

  TIMESHEET_DAYS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid approverEmployeeId FK
    date workDate "unique with employee"
    string status
  }

  TIMESHEET_ENTRIES {
    uuid id PK
    uuid timesheetDayId FK
    uuid categoryId FK
    string projectName
  }
```

### Expenses

```mermaid
erDiagram
  EMPLOYEES ||--o{ EXPENSE_CLAIMS : "employeeId CASCADE"
  EMPLOYEES ||--o{ EXPENSE_CLAIMS : "managerEmployeeId SET NULL"
  EMPLOYEES ||--o{ EXPENSE_CLAIMS : "financeActorEmployeeId SET NULL"
  EMPLOYEES ||--o{ EXPENSE_CLAIMS : "paidByEmployeeId SET NULL"
  EXPENSE_CLAIMS ||--o{ EXPENSE_CLAIM_LINES : "claimId CASCADE"
  EXPENSE_CATEGORIES ||--o{ EXPENSE_CLAIM_LINES : "categoryId RESTRICT"
  EXPENSE_RECEIPTS ||--o{ EXPENSE_CLAIM_LINES : "receiptDocumentId SET NULL"
  EMPLOYEES ||--o{ EXPENSE_RECEIPTS : "employeeId CASCADE"
  EXPENSE_CLAIMS ||--o{ EXPENSE_RECEIPTS : "claimId CASCADE"
  EXPENSE_CLAIMS ||--o{ EXPENSE_CLAIM_AUDIT_LOGS : "claimId CASCADE"
  EMPLOYEES ||--o{ EXPENSE_CLAIM_AUDIT_LOGS : "actorEmployeeId SET NULL"

  EXPENSE_CATEGORIES {
    uuid id PK
    uuid organizationId "tenant isolation"
    string code
    string name
    boolean isActive
  }

  EXPENSE_CLAIMS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid managerEmployeeId FK
    uuid financeActorEmployeeId FK
    uuid paidByEmployeeId FK
    string claimNumber
    string status
    numeric totalAmount
  }

  EXPENSE_CLAIM_LINES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid claimId FK
    uuid categoryId FK
    uuid receiptDocumentId FK
    date expenseDate
    numeric amount
  }

  EXPENSE_RECEIPTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid claimId FK
    string storageKey
  }

  EXPENSE_CLAIM_AUDIT_LOGS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid claimId FK
    uuid actorEmployeeId FK
    string action
  }
```

### Notifications

One inbox row can point at a leave request, an attendance regularization, or an expense claim. All three foreign keys are nullable and use `SET NULL` if the source row is removed. The recipient is always an employee (`CASCADE`).

```mermaid
erDiagram
  EMPLOYEES ||--o{ EMPLOYEE_NOTIFICATIONS : "recipientEmployeeId CASCADE"
  LEAVE_REQUESTS ||--o{ EMPLOYEE_NOTIFICATIONS : "leaveRequestId SET NULL"
  ATTENDANCE_REGULARIZATION_REQUESTS ||--o{ EMPLOYEE_NOTIFICATIONS : "attendanceRegularizationRequestId SET NULL"
  EXPENSE_CLAIMS ||--o{ EMPLOYEE_NOTIFICATIONS : "expenseClaimId SET NULL"

  EMPLOYEE_NOTIFICATIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid recipientEmployeeId FK
    uuid leaveRequestId FK
    uuid attendanceRegularizationRequestId FK
    uuid expenseClaimId FK
    string type
    timestamptz readAt
  }
```

### Performance

`performance_sections.role` is a role label (`EMPLOYEE`, `MANAGER`, `HR`, or a custom RBAC role code). It is not a foreign key to `rbac_roles`.

```mermaid
erDiagram
  PERFORMANCE_SECTIONS ||--o{ PERFORMANCE_QUESTIONS : "sectionId CASCADE"
  EMPLOYEES ||--o{ PERFORMANCE_ASSESSMENTS : "employeeId CASCADE"
  EMPLOYEES ||--o{ PERFORMANCE_ASSESSMENTS : "alignManagerEmployeeId SET NULL"
  PERFORMANCE_ASSESSMENTS ||--o{ PERFORMANCE_ANSWERS : "assessmentId CASCADE"

  PERFORMANCE_SECTIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    string key
    string role "logical role code, not an FK"
    int sortOrder
  }

  PERFORMANCE_QUESTIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid sectionId FK
    string key
    int sortOrder
  }

  PERFORMANCE_RATING_OPTIONS {
    uuid id PK
    uuid organizationId "tenant isolation"
    string label
    int weight
  }

  PERFORMANCE_ASSESSMENTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid alignManagerEmployeeId FK
    string templateKey
    string cycleLabel
    string status
  }

  PERFORMANCE_ANSWERS {
    uuid id PK
    uuid assessmentId FK
    string questionKey "unique with assessmentId"
  }
```

### Skills

```mermaid
erDiagram
  SKILL_CATEGORIES ||--o{ SKILL_SUBCATEGORIES : "categoryId RESTRICT"
  SKILL_CATEGORIES ||--o{ SKILLS : "categoryId RESTRICT"
  SKILL_SUBCATEGORIES ||--o{ SKILLS : "subcategoryId RESTRICT"
  SKILLS ||--o{ EMPLOYEE_SKILLS : "skillId RESTRICT"
  EMPLOYEES ||--o{ EMPLOYEE_SKILLS : "employeeId RESTRICT"

  SKILL_CATEGORIES {
    uuid id PK
    uuid organizationId "tenant isolation"
    string name
    int sortOrder
  }

  SKILL_SUBCATEGORIES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid categoryId FK
    int sortOrder
  }

  SKILLS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid categoryId FK
    uuid subcategoryId FK
    string name
    boolean isActive
  }

  EMPLOYEE_SKILLS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid skillId FK
    string proficiency
  }
```

### Document Centre

Separate from `employee_documents`. Policies and forms have a null `employeeId`. Form 16 rows set `employeeId` to the person the certificate belongs to.

```mermaid
erDiagram
  EMPLOYEES ||--o{ DOCUMENT_CENTRE_DOCUMENTS : "employeeId SET NULL"
  EMPLOYEES ||--o{ DOCUMENT_CENTRE_DOCUMENTS : "uploadedByEmployeeId SET NULL"
  DOCUMENT_CENTRE_UPLOAD_BATCHES ||--o{ DOCUMENT_CENTRE_DOCUMENTS : "uploadBatchId SET NULL"
  EMPLOYEES ||--o{ DOCUMENT_CENTRE_UPLOAD_BATCHES : "uploadedByEmployeeId SET NULL"

  DOCUMENT_CENTRE_UPLOAD_BATCHES {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid uploadedByEmployeeId FK
  }

  DOCUMENT_CENTRE_DOCUMENTS {
    uuid id PK
    uuid organizationId "tenant isolation"
    uuid employeeId FK
    uuid uploadBatchId FK
    uuid uploadedByEmployeeId FK
    string category
    string title
    string storageKey
  }
```

### Tenant RBAC and settings

```mermaid
erDiagram
  RBAC_ROLES ||--o{ RBAC_ROLE_PERMISSIONS : "roleId CASCADE"
  RBAC_PERMISSIONS ||--o{ RBAC_ROLE_PERMISSIONS : "permissionId CASCADE"
  EMPLOYEES ||--o{ RBAC_EMPLOYEE_ROLE_ASSIGNMENTS : "employeeId CASCADE"
  RBAC_ROLES ||--o{ RBAC_EMPLOYEE_ROLE_ASSIGNMENTS : "roleId CASCADE"
  SETTINGS_CATALOG ||--o{ TENANT_SETTINGS : "settingCatalogId CASCADE"

  RBAC_ROLES {
    uuid id PK
    string code UK
    string name
    boolean isSystem
    boolean isActive
  }

  RBAC_PERMISSIONS {
    uuid id PK
    string code UK
    string moduleCode "logical platform module code"
    string action
  }

  RBAC_ROLE_PERMISSIONS {
    uuid id PK
    uuid roleId FK
    uuid permissionId FK
    string accessScope
  }

  RBAC_EMPLOYEE_ROLE_ASSIGNMENTS {
    uuid id PK
    uuid employeeId FK
    uuid roleId FK
    boolean isPrimary
  }

  RBAC_PERMISSION_AUDIT_LOGS {
    uuid id PK
    string action
    uuid actorEmployeeId "no JoinColumn"
    jsonb before
    jsonb after
  }

  ORGANIZATION_SETTINGS {
    uuid id PK
    string key UK
    jsonb value
  }

  SETTINGS_CATALOG {
    uuid id PK
    uuid organizationId "optional tenant isolation"
    string key
    string scope
  }

  TENANT_SETTINGS {
    uuid id PK
    uuid organizationId "optional tenant isolation"
    uuid settingCatalogId FK
    jsonb value
  }
```

`organization_settings` is the key/value store the settings API actually reads (profile, attendance, timesheet policy, expense policy defaults). It has no `organizationId` because the tenant database is the boundary and `key` is unique inside it. `settings_catalog` and `tenant_settings` are the older catalog pair; both carry an optional `organizationId`.

---

## Foreign keys versus tenant isolation

| Kind | Where | Enforced by Postgres |
| --- | --- | --- |
| Master FK | `users.organizationId`, `organization_subscriptions.organizationId`, `organization_module_entitlements.organizationId`, `refresh_sessions.organizationId`, `refresh_sessions.masterUserId`, `auth_handoff_tokens.refreshSessionId` | Yes. Delete of an organization cascades to users, subscriptions, entitlements, and refresh sessions. |
| Tenant FK | Every `@JoinColumn` in the tenant diagrams (`employeeId`, `departmentId`, `claimId`, `skillId`, and the rest) | Yes, inside that tenant database only. |
| Tenant isolation column | `organizationId` on employees, ESS, attendance, timesheets, skills, documents, calendars, expense, performance, biometric, departments, designations, locations, shifts, leave config | No. Application code sets it to the master organization id. A wrong value does not violate a constraint. |
| Cross-database pointer | `refresh_sessions.employeeId` → tenant `employees.id` | No. |
| Code match, not a FK | `organization_module_entitlements.moduleCode` → `platform_modules.code`; tenant `rbac_permissions.moduleCode` → the same catalog code; `organization_calendar_holidays.locationId`; `attendance_punches.deviceId`; `organization_subscriptions.createdByUserId` | No. |
