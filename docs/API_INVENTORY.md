# peopleAIQ Backend — API Inventory

Scanned from every NestJS controller under `ghoulhr-backend/src/` (30 controllers, 230 HTTP routes). There is no global URL prefix: paths below are the paths the server actually mounts (Swagger UI is served separately at `GET /api-docs` and is not a controller route).

## How access control works

Every request passes through these layers before a controller method runs.

| Layer | What it does |
| --- | --- |
| `TenantResolverMiddleware` | Applied to `*` except paths starting with `/auth`, `/api/auth`, `/api/super-admin`, `/api-docs`, and `/health`. Resolves the tenant from the host (or `TENANT_LOCK_SUBDOMAIN`) and attaches `organization` plus the tenant `DataSource`. Inactive or unknown tenants are rejected here. |
| `APP_GUARD` → `MustChangePasswordGuard` | Registered globally in `auth.module.ts`. If the access cookie belongs to an employee whose token has `mustChangePassword`, every route returns `403` with code `PASSWORD_CHANGE_REQUIRED`, except the allowlist: `GET /auth/session`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`. Requests with no token, an invalid token, or a non-employee token are not blocked by this guard (later guards still apply). |
| `AuthTokenGuard` | Platform (control-plane) routes. Reads the access token from the HttpOnly cookie (Bearer is accepted for tooling), verifies the JWT, and attaches `req.user`. Does not check that the token’s subdomain matches the current host. |
| `RolesGuard` + `@Roles(SUPER_ADMIN)` | After `AuthTokenGuard`. Allows the call only when `req.user.role` is `SUPER_ADMIN`. |
| `TenantAuthGuard` | Tenant portal routes. Requires a valid access token and, when tenant middleware has attached an organization, requires the token’s `organizationSubdomain` to match that tenant. A token minted for another company cannot call this company’s APIs. |
| `SubscriptionGuard` | When an organization is on the request, calls `assertOrganizationHasValidSubscription`. Expired, missing, or otherwise invalid subscriptions are rejected before business logic runs. |
| `PermissionsGuard` + `@RequirePermissions` / `@RequireAnyPermission` | Enforced only when RBAC enforcement is on (`RbacConfigService`). `@RequirePermissions` means the caller must hold **every** listed permission (default mode `all`). `@RequireAnyPermission` means **any one** listed permission is enough. Settings permissions (`settings.*`) and employee permissions (`employees:*`) can be bypassed when those enforcement flags are off. The guard also requires a resolvable tenant employee profile. A handler with no permission decorator is allowed through this guard once the caller is authenticated. |

Authentication for portal and super-admin clients is cookie-based (`AuthCookieService`). Responses that log a user in also set the refresh cookie.

In the tables, **Guards Required** lists the guards that actually wrap that handler. `APP_GUARD` is present on every route; rows marked **APP_GUARD (allowlisted)** are the four paths the password-change lock explicitly skips.

---

## `app/` — process health

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `app/` | `GET /` | `app.controller.ts` | `APP_GUARD` (`MustChangePasswordGuard`). No auth guard. | Liveness probe for the Nest process. Returns the static hello string from `AppService`. Load balancers, container orchestrators, and uptime checks call this to confirm the HTTP server is accepting connections. It does not check the database, tenant resolution, S3, or subscription state, so a `200` only means the process is up. Tenant middleware skips `/health`, but this route is `/`, so the middleware still runs and a request on an unknown host can fail before the handler. |

---

## `auth/` — sessions, cookies, and sign-in

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `auth/` | `GET /auth/session` | `auth.controller.ts` | `APP_GUARD` (allowlisted). No `AuthTokenGuard` / `TenantAuthGuard`; the handler reads the cookie itself. | Restores the signed-in identity for the web app on every page load. Reads the access cookie (or Bearer token used by API tooling), verifies it, and returns the session profile built by `AuthSessionService`, plus `sessionExpiresAt` when the JWT carries `sessionExp`. The SPA uses this to decide whether to show the portal, the super-admin console, or the login screen, and to know whether a forced password change is still outstanding. Returns `401` when the cookie is missing or the access token is invalid; it does not rotate tokens. |
| `auth/` | `POST /auth/refresh` | `auth.controller.ts` | `APP_GUARD` (allowlisted). No route guard; `AuthRefreshService` validates the refresh cookie. | Silent session extension. Consumes the refresh cookie, rotates the refresh session, and re-issues both the access cookie and the refresh cookie. The browser calls this when the access token is near expiry or when `/auth/session` returns `401` but a refresh cookie may still be valid. Invalid, revoked, or expired refresh sessions return `401` and the user must sign in again. Because this path is allowlisted, an employee who still must change their password can refresh without being locked out of the change-password flow. |
| `auth/` | `POST /auth/logout` | `auth.controller.ts` | `APP_GUARD` (allowlisted). No route guard. | Ends the browser session. Revokes the current refresh session server-side and clears the auth cookies on the response. Use this from the portal “Sign out” action and from the super-admin console so a stolen refresh cookie cannot mint new access tokens after logout. Safe to call when already logged out; the intended outcome is an unauthenticated browser. |
| `auth/` | `POST /auth/handoff/consume` | `auth.controller.ts` | `APP_GUARD`. No route guard; the one-time code is the credential. | Completes a cross-host login. After a user signs in on a central host, the login response may include a short-lived handoff code. The tenant subdomain’s app posts that code here. The server checks the code is unused, unexpired, and valid for the current `Host`, then sets auth cookies on that tenant API host and returns `{ ok: true }`. This exists because cookies are host-scoped: a cookie set on the marketing or apex host is not sent to `acme.example.com`. `401` means the code is bad or expired; `403` means the code was issued for a different host. |
| `auth/` | `POST /auth/register` | `auth.controller.ts` | `APP_GUARD`. No JWT guard. Optional header `x-bootstrap-admin-key` when the payload asks for `SUPER_ADMIN`. | Creates a user inside the tenant organization carried by the request context and immediately signs them in by attaching access and refresh cookies. Returns the created user (tokens stay in cookies). `400` covers a bad payload or organization; `409` means that user already exists in the organization; `403` means the requested role cannot be assigned. Assigning `SUPER_ADMIN` is refused unless the bootstrap admin key header matches. This is a provisioning/bootstrap registration path, not the employee self-signup flow used by the ESS portal. |
| `auth/` | `POST /auth/login` | `auth.controller.ts` | `APP_GUARD`. No JWT guard. Credentials are email/password in `LoginDto`. | Primary sign-in for both the tenant portal and the platform console. Tries tenant employee login first (`TenantAuthService`) against the resolved tenant database. If that fails with unauthorized, it falls back to platform user login (`AuthService`), which is how a super admin signs in. On success it sets auth cookies and returns the user, `requiresPasswordChange` when the employee must rotate a temporary password, and a `handoff` code when the login host is not the tenant host the session should live on. `401` is bad credentials; `403` is an inactive user. The web app should send the user to change-password before any other portal call when `requiresPasswordChange` is true. |
| `auth/` | `POST /auth/superadmin/bootstrap` | `auth.controller.ts` | `APP_GUARD`. No JWT guard. Requires header `x-bootstrap-admin-key`. | One-time provisioning of the first platform `SUPER_ADMIN` when none exists. Body is `BootstrapSuperAdminDto`. On success the new admin is signed in via cookies and the user object is returned. `403` is a wrong or missing bootstrap key; `409` means a super admin already exists and this endpoint must not be used again. Operations uses this once when standing up a fresh control-plane database, then disables or rotates the bootstrap key. |
| `auth/` | `POST /auth/employee/login` | `tenant-auth.controller.ts` | `APP_GUARD`. No JWT guard. | Employee-only sign-in. Validates credentials against the tenant employee record (not the platform user table), sets cookies, and returns the employee user, optional `requiresPasswordChange`, and an optional handoff code under the same host rules as unified login. `401` is bad credentials; `403` is an inactive or locked account. Use this when the client already knows it is on a tenant host and should not fall through to super-admin login. First-login temporary passwords surface `requiresPasswordChange: true` so the UI can block the rest of ESS until `POST /auth/change-password` succeeds. |
| `auth/` | `POST /auth/change-password` | `tenant-auth.controller.ts` | `APP_GUARD` (allowlisted); `TenantAuthGuard`; `SubscriptionGuard`. No permission decorator. | Lets a signed-in tenant employee replace their password, including the mandatory first-login rotation. Body is `ChangePasswordDto` (current password plus a new password that must meet policy). The handler requires `req.organization`, a tenant data source, and `req.user`. On success it re-issues the access cookie (keeping the existing refresh cookie) so `mustChangePassword` is cleared, and returns a message, the flag, and the user. `401` is a wrong current password; `400` is a new password that fails strength rules. This is the only portal mutation an employee with `PASSWORD_CHANGE_REQUIRED` is allowed to perform besides session, refresh, and logout. |

---

## `organizations/` — platform tenant lifecycle

All routes in this controller are control-plane APIs. They are not used by ESS or HR users inside a company.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `organizations/` | `POST /organizations` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Creates a new customer tenant. Body is `CreateOrganizationDto` (identity, subdomain, and the fields the service needs to provision the organization record and its database). Returns the `Organization`. `409` when the subdomain is already taken. Super admins use this from the platform console when onboarding a new company. Creating the org does not by itself grant a subscription or turn on product modules; those are separate calls on this same controller and on the subscription controller. |
| `organizations/` | `GET /organizations` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Lists active (non-deleted) organizations for the super-admin directory. The console uses this as the customer table: name, subdomain, status, and identifiers needed to open a tenant, edit it, or jump to subscription and module screens. Does not include soft-deleted tenants; those are `GET /organizations/deleted`. |
| `organizations/` | `GET /organizations/dashboard/stats` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Aggregated platform metrics for the super-admin home dashboard (`OrganizationsService.getSuperAdminStats`). Used to show how many tenants exist and the headline counts operations watches, without loading every organization row. |
| `organizations/` | `GET /organizations/stats` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Alias of `GET /organizations/dashboard/stats`. Same service method and same payload. Kept so older console clients that call `/organizations/stats` keep working. |
| `organizations/` | `GET /organizations/deleted` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Lists organizations that were soft-deleted. The console “Deleted tenants” view uses this so an operator can find a tenant and restore it with `PATCH /organizations/id/:id/restore`. These rows are intentionally absent from the main list. |
| `organizations/` | `PATCH /organizations/id/:id` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Partial update of an organization by primary key. Body is `UpdateOrganizationDto`. `404` if the id does not exist. Used to correct name, status, subdomain-related fields, or other profile data after the tenant has been created. The `id/` prefix exists so this route is not captured by `GET /organizations/:subdomain`. |
| `organizations/` | `DELETE /organizations/id/:id` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Soft-deletes an organization. The tenant disappears from the active list and should stop being resolvable for portal traffic, but the row remains so it can be restored. `404` if the id is unknown. Use this to offboard a customer without immediately destroying their database. |
| `organizations/` | `PATCH /organizations/id/:id/restore` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Undoes a soft delete and returns the organization to the active set. `404` if there is no deleted organization with that id. Operators use this after a mistaken delete or when a churned customer returns. Restoring the row does not automatically renew an expired subscription. |
| `organizations/` | `GET /organizations/id/:id` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Fetches one organization by UUID for the tenant detail page. `404` when missing. This is the record the console edits, and the id used by subscription and module-entitlement calls. |
| `organizations/` | `GET /organizations/:subdomain` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Fetches one organization by subdomain (example `acme`). `404` when no tenant uses that subdomain. Support and provisioning use this when they know the customer’s host label but not the UUID. Declared after the `id/` routes so literals such as `deleted` and `stats` are not swallowed; a subdomain that collides with a static segment will not reach this handler. |
| `organizations/` | `GET /organizations/id/:id/modules` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Returns the product-module entitlements for a tenant (`OrganizationEntitlementService`). The console uses this to show which modules (leave, attendance, expenses, skills, and so on) the customer is allowed to use. Entitlements also filter which permissions `GET /rbac/permissions` offers inside that tenant. |
| `organizations/` | `PATCH /organizations/id/:id/modules` | `organizations.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Replaces the set of enabled module codes for the organization (`SetOrganizationModulesDto.enabledModuleCodes`). The acting super admin’s subject is stored as the actor. Use this when a contract changes: turning a module off should hide its permissions and features from that tenant’s RBAC catalog; turning it on makes those permissions assignable. This does not create roles or grant those permissions to employees by itself. |

---

## `subscriptions/` — tenant commercial access

Controller is mounted on `organizations` but lives in the subscriptions module. Same super-admin gate as organization admin.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `subscriptions/` | `GET /organizations/id/:id/subscription` | `organization-subscription.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Current commercial state of one tenant. Confirms the organization exists, then returns the current subscription row, a summary (`toSummary`), `isValid`, and a `reason` when access would be denied. The console subscription panel and support use this to see why a tenant is locked out. `SubscriptionGuard` on portal routes calls the same validity check, so this response is what employees experience as “subscription required.” |
| `subscriptions/` | `GET /organizations/id/:id/subscriptions` | `organization-subscription.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Paginated history of subscription records for the organization (`SubscriptionHistoryQueryDto`). Used to audit plan changes: what was assigned, what was superseded on renewal, and who acted. This is history, not the live gate; the live gate is the current-subscription endpoint. |
| `subscriptions/` | `POST /organizations/id/:id/subscription` | `organization-subscription.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Assigns the first subscription (`CreateSubscriptionDto`) and records the super-admin subject as actor. Returns the new subscription, summary, and `isValid`. `409` if an active subscription already exists — renewals must use the renew endpoint so the previous plan is superseded instead of duplicated. Call this immediately after creating an organization; until a valid subscription exists, tenant portal routes behind `SubscriptionGuard` reject the company’s users. |
| `subscriptions/` | `POST /organizations/id/:id/subscription/renew` | `organization-subscription.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Renews or replaces the current plan (`RenewSubscriptionDto`). The service supersedes the active subscription and writes a new one, again attributing the actor. Returns the new subscription, summary, and validity. Use this at contract renewal, plan upgrades, or to restore access after expiry. History of the old plan remains available on the list endpoint. |

---

## `leads/` — marketing inbox

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `leads/` | `GET /leads` | `leads.controller.ts` | `APP_GUARD`; `AuthTokenGuard`; `RolesGuard`; `@Roles(SUPER_ADMIN)` | Paginated list of inbound marketing leads from “contact us” and demo-request captures (`ListLeadsQueryDto` → `PaginatedLeadsDto`). Super admins use this as the sales inbox: who asked for a demo, how to filter the queue, and which leads to turn into an organization. It does not create tenants; conversion is a separate manual step via `POST /organizations`. |

---

## `employees/` — HR roster, onboarding, and reporting lines

Class-level guards on every route: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. The permission on each row is additional. List and detail also apply RBAC **data scope** (`EmployeeScopeService.getVisibleEmployeeIds` for `employees:read`): a manager may only see people inside their scope even if they hold the permission.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `employees/` | `GET /employees` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:read')` | HR roster for the current tenant, filtered to employee ids the caller is allowed to see. Returns the scoped employee list (not the public directory — that is `/people`). HR and scoped managers use this to populate employee admin screens. An empty scope yields an empty list rather than the whole company. |
| `employees/` | `POST /employees/check-duplicate` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:onboard')` | Pre-flight duplicate check used by the onboarding wizard before submit. Body is `CheckEmployeeDuplicateDto` (email and/or phone). Returns whether those identifiers already exist in the tenant so HR can correct the form instead of failing at create time. Does not write an employee. |
| `employees/` | `POST /employees/hr-onboarding` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:onboard')` | Full enterprise hire. Body is `EmployeeOnboardingCreateDto` (modular sections: identity, job, org placement, and the documents the onboarding payload carries). Persists the employee, generates a temporary password that must be changed on first login, and emails the new hire via `sendEmployeeCreated` when the organization name and employee email are present. Response includes the employee summary and `credentials` (temporary password, expiry, `mustChangeOnFirstLogin: true`) so HR can also share them out of band. The access token must contain `sub` or the call is `401`. This is the path the HR onboarding UI should use; `POST /employees` is the shorter create. |
| `employees/` | `PATCH /employees/:id/hr-onboarding` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:onboard')` | Updates an existing employee using the same modular onboarding payload, so HR can correct or complete a hire without the flat `UpdateEmployeeDto`. Actor `sub` is required. Use this when the onboarding wizard is reopened for an employee who was already created. |
| `employees/` | `GET /employees/reporting-managers` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reporting-manager:read')` | Directory of employees who currently have an active reporting-manager assignment. Query is `ListReportingManagersQueryDto` (filters/pagination the DTO defines). HR uses this to audit the org chart: who reports to whom, and to find people whose manager needs to change. |
| `employees/` | `GET /employees/reporting-manager-candidates` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reporting-manager:read')` | People who may be chosen as a reporting manager, limited to the caller’s `employees:read` visibility scope. Powers the manager picker so HR cannot assign a manager they are not allowed to see, and so inactive or out-of-scope employees do not appear. |
| `employees/` | `GET /employees/:id/reporting-manager` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reporting-manager:read')` | The active primary reporting manager for one employee. Used on the employee profile and before changing the assignment. Returns the current assignment only, not historical managers. |
| `employees/` | `POST /employees/:id/reporting-manager` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reporting-manager:assign')` | Assigns or replaces the employee’s primary reporting manager (`AssignReportingManagerDto`). This relationship drives manager-scoped approvals (leave, timesheets, expenses, attendance regularization) and “my team” views. Call it when a person joins a team or moves to a new manager. There is a single active primary assignment; posting again changes it. |
| `employees/` | `DELETE /employees/:id/reporting-manager` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reporting-manager:assign')` | Removes the active reporting-manager assignment and returns `{ message: 'Reporting manager removed' }`. Use when someone should temporarily have no manager (for example between teams). Downstream approval queues that depend on the manager will no longer route to the previous manager. |
| `employees/` | `GET /employees/:id` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:read')` | Full HR employee record by id, serialized for the admin profile. If the id is outside the caller’s visibility scope, the response is `{ message: 'Employee not found' }` rather than `403`, so the API does not reveal that the person exists. Same message when the id is genuinely missing. |
| `employees/` | `POST /employees` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:create')` | Shorter employee create (`CreateEmployeeDto`) for cases that do not use the modular onboarding wizard. Still generates a temporary password, forces change on first login, returns credentials, and sends the welcome email. Prefer `POST /employees/hr-onboarding` when the UI collects documents and extended HR sections. |
| `employees/` | `POST /employees/:id/reset-password` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:reset-password')` | Admin password reset. Issues a new temporary password and expiry; the employee must change it on next login. Response tells HR to share the credential securely. There is no email send in the controller itself — the caller is expected to deliver the temporary password. Use when an employee is locked out. The reset is audited via service logs that include the acting admin subject. |
| `employees/` | `PATCH /employees/:id` | `employees.controller.ts` | Class guards; `@RequirePermissions('employees:update')` | Partial update of core employee fields (`UpdateEmployeeDto`): status, job data, and the other fields that DTO allows. Used by the employee admin edit form when the change is not a full onboarding resubmit. Actor subject and organization id are passed through for audit. |

---

## `people/` — read-only directory

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Every route also requires `employees:read` and applies the same visibility scope as the HR roster. This module is the employee-facing directory, not the HR edit API.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `people/` | `GET /people` | `people.controller.ts` | Class guards; `@RequirePermissions('employees:read')` | Paginated people directory. Query `view` is required: `everyone` (anyone inside the caller’s RBAC scope) or `team` (direct reports). Optional filters include search, department, designation, status, and page/limit (limit max 50). The ESS “People” screen uses this so employees can find colleagues without receiving the HR admin payload from `GET /employees`. Scope still applies on the everyone view: a team-scoped role does not see the whole company. |
| `people/` | `GET /people/filter-options` | `people.controller.ts` | Class guards; `@RequirePermissions('employees:read')` | Department and designation options for the directory filter dropdowns, for the current organization. Loaded once when the People page opens so the UI does not hard-code org structure. Does not return employees. |
| `people/` | `GET /people/:id` | `people.controller.ts` | Class guards; `@RequirePermissions('employees:read')` | Read-only profile card for one person (UUID). Enforces visibility scope before returning the directory profile. Used when someone opens a colleague from the directory. It is not the HR edit model and should not be used to change employment data. |

---

## `rbac/` — roles, grants, and audit

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. `rbac:read` is the auditor/viewer grant; `rbac:manage` is the administrator grant. Permission catalogs are limited to modules the organization is entitled to.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `rbac/` | `GET /rbac/roles` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:read')` | Lists tenant roles with counts and flags (system vs custom, active, how many people hold the role). The Roles settings screen uses this as its table. Viewing roles does not reveal every permission bit; open `GET /rbac/roles/:id` for the grant detail. |
| `rbac/` | `POST /rbac/roles` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Creates a custom role (`CreateRoleDto`: name, description). The actor is `req.user.sub`. Custom roles start without a useful permission set until `PATCH /rbac/roles/:id/permissions` is called. System roles are not created here. |
| `rbac/` | `GET /rbac/permissions` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:read')` | Catalog of permission codes the tenant is allowed to assign, filtered by organization module entitlements. The role editor renders checkboxes from this list. If super admin has not enabled a module, its permissions do not appear and cannot be granted. |
| `rbac/` | `GET /rbac/roles/:id` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:read')` | One role plus its current permission entries (code and access scope). Used to populate the role editor and to review what a role can do before assigning it to someone. |
| `rbac/` | `PATCH /rbac/roles/:id` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Renames a custom role or edits its description (`UpdateRoleDto`). Does not change permissions. System roles that the service treats as immutable will be rejected by the service. |
| `rbac/` | `PATCH /rbac/roles/:id/deactivate` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Deactivates a custom role so it can no longer be used for new access. Existing assignments should stop granting that role’s permissions once deactivated. Use this instead of deleting a role that already appears in audit history. |
| `rbac/` | `POST /rbac/roles/:id/clone` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Copies a role and its permission set under a new name (`CloneRoleDto`). Used to spin up “HR assistant” from “HR admin” and then narrow the clone, rather than re-checking dozens of permissions. |
| `rbac/` | `PATCH /rbac/roles/:id/permissions` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Replaces the role’s grants. Body may be `permissions[]` of `{ permissionCode, accessScope }` or a legacy `permissionCodes[]` which defaults each scope to `SELF`. At least one entry is required (`400` otherwise). Access scope (`SELF`, team, organization, and the other `AccessScope` values) controls whose data a permission applies to — for example `employees:read` at team scope vs company scope. This is the call that actually changes what a role can do. The actor is audited. |
| `rbac/` | `GET /rbac/employees/:employeeId/roles` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:read')` | Role assignments currently on one employee, including which role is primary. The employee admin “Access” tab uses this before editing. |
| `rbac/` | `PATCH /rbac/employees/:employeeId/roles` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:manage')` | Sets the employee’s roles (`AssignEmployeeRolesDto.roleIds`) and optional `primaryRoleId`. This is how a person becomes a manager, HR admin, or finance approver. Effective permissions are the union of assigned roles, evaluated by `PermissionsGuard` on later API calls. Changes are attributed to the acting subject. |
| `rbac/` | `GET /rbac/audit-logs` | `rbac.controller.ts` | Class guards; `@RequirePermissions('rbac:read')` | Paginated RBAC audit trail (`ListAuditLogsQueryDto`): role creates, permission edits, assignments, deactivations. Compliance and security reviews use this to answer who changed access and when. It is the RBAC log, not the employee field-change log shown on the HR dashboard. |

---

## `hr-dashboard/` — organization admin home

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `hr-dashboard/` | `GET /dashboard/hr` | `hr-dashboard.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequirePermissions('dashboard.hr:read')` | Aggregate for the HR / organization-admin home screen. The payload is permission-shaped, not a single fixed scorecard. If the caller also has `employees:read`, it includes `totalEmployees` and `presentToday` counted only inside that caller’s employee visibility scope, plus `recentActivity` from employee audit logs. If they can read departments (any of `settings.departments:read`, `settings.organization:read`, or `settings.employees:read`), it includes `activeDepartments`. If they have `payroll:read`, `pendingPayroll` is returned (currently a placeholder `0`). A user with only `dashboard.hr:read` still gets a dashboard object, but stat tiles they are not entitled to are omitted. Use this for the admin landing page; the employee landing page is `GET /ess/home`. |

---

## `settings/` — organization configuration

Class-level guards on `settings.controller.ts`: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Several routes use `@RequireAnyPermission`, so any one listed grant is enough. When settings RBAC enforcement is disabled, `settings.*` permissions are not checked.

`GET /settings/:key` is a catch-all. Static paths (`profile`, `branding`, `employee`, `departments`, `designations`, `attendance`, `timesheet`, `locations`, `leave-config`) are declared first and win. Reserved keys that collide with those path segments are rejected with `400` if they ever reach the catch-all.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `settings/` | `GET /settings/profile` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.organization:read')` | Reads the organization profile block: display name, logo, timezone, currency, date format, language, and financial-year start month. The Organization Settings page loads this to render the company identity form. Timezone from this profile is what attendance “today” and other org-local dates are calculated against. |
| `settings/` | `GET /settings/branding` | `settings.controller.ts` | Class guards. No permission decorator, so any authenticated employee of a valid subscription can call it. | Lightweight name and logo for the application shell (sidebar, login-adjacent header, document headers). Intentionally broader than `GET /settings/profile` so every employee sees the company brand without holding organization-settings read. Does not return timezone, currency, or other admin-only profile fields. |
| `settings/` | `POST /settings/profile` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Updates organization profile (`UpdateOrgProfileDto`). Only supplied fields change. Allowed values are constrained: timezone, currency, date format, language, and financial-year start month must be members of the supported lists in `settings.constants`. Returns the written updates. Changing timezone changes how “today,” attendance calendars, and holiday years are interpreted for the whole tenant. |
| `settings/` | `GET /settings/employee` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.employees:read')` | Employee-master policy: ID prefix, whether IDs are auto-generated, which fields are required on an employee record, and the other keys `getEmployeeSettings` returns. HR settings and the onboarding wizard read this so new hires follow the company’s numbering and required-field rules. |
| `settings/` | `POST /settings/employee` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.employees:write')` | Bulk update of employee-master policy (`UpdateEmployeeSettingsDto`), including ID prefix (max 10 characters), auto-generate flag, and required field list (limited to `ALLOWED_EMPLOYEE_FIELDS`). Applied to future creates and validation; it does not renumber existing employees by itself. |
| `settings/` | `GET /settings/departments` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.departments:read')` | Lists department master rows for the organization. Consumed by settings, onboarding department pickers, people filters, and the HR dashboard department count. |
| `settings/` | `POST /settings/departments` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.departments:write')` | Replaces department master data (`UpdateDepartmentsDto`). This is a full replace of the submitted set, not a single-row PATCH. HR uses it to add, rename, or retire departments in one save. Employees already pointing at a removed department need a data check after the replace. |
| `settings/` | `GET /settings/designations` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.designations:read')` | Lists designation / job-title master rows. Used by settings, onboarding, and the people directory designation filter. |
| `settings/` | `POST /settings/designations` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.designations:write')` | Replaces designation master data in one save (`UpdateDesignationsDto`). Same replace semantics as departments. |
| `settings/` | `GET /settings/attendance` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.attendance:read')` | Attendance policy for the tenant: work week days, shift timing, tracking mode, punch-direction mode, and the other keys `getAttendanceSettings` stores. ESS sign-in/out, late calculations, and “who is in” all depend on this configuration. |
| `settings/` | `POST /settings/attendance` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.attendance:write')` | Bulk update of attendance policy (`UpdateAttendanceSettingsDto`). Weekdays must be valid weekday tokens; tracking mode and punch-direction mode must be values the constants allow. Changing shift times changes how later punches are classified as on time or late. It does not rewrite historical daily summaries. |
| `settings/` | `GET /settings/timesheet` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:read')` | Timesheet rules (submission deadlines, whether future/backdated entry is allowed, and related policy stored by `getTimesheetSettings`). Admins edit them here; employees read a projected view via `GET /ess/timesheet/settings`. |
| `settings/` | `POST /settings/timesheet` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:write')` | Updates timesheet rules (`UpdateTimesheetSettingsDto`). Affects whether `PUT /ess/timesheet/days/:date` will accept a save or submit. Does not change category master data; categories have their own routes. |
| `settings/` | `GET /settings/timesheet/categories` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:read')` | Admin list of timesheet categories (billable/non-billable labels employees pick when logging time), including inactive ones the admin screen needs. Employees only see active categories on `GET /ess/timesheet/categories`. |
| `settings/` | `POST /settings/timesheet/categories` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:write')` | Creates one timesheet category (`CreateTimesheetCategoryDto`). New categories become available on the employee entry form once active. |
| `settings/` | `PUT /settings/timesheet/categories/:id` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:write')` | Updates a category’s name, code, or active flag (`UpdateTimesheetCategoryDto`). Deactivating a category hides it from new entries; historical timesheet lines keep their stored category reference. |
| `settings/` | `DELETE /settings/timesheet/categories/:id` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.timesheet:write')` | Deletes a timesheet category. Use when the category was created in error. If the service blocks deletion because lines still reference it, the admin should deactivate via PUT instead. |
| `settings/` | `GET /settings/locations` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.locations:read')` | Branch / work-location master (address and the fields `getLocationConfigurations` returns). Locations scope leave types, holiday applicability, and where an employee is based. |
| `settings/` | `POST /settings/locations` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.locations:write')` | Replaces the organization’s location configurations (`UpdateLocationConfigurationsDto`). Full replace, same pattern as departments. Leave configuration is stored per branch, so location changes should be coordinated with `POST /settings/leave-config`. |
| `settings/` | `GET /settings/leave-config` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.leave:read')` | Leave-type master rows, per branch: codes, names, accrual/balance rules, and whether a type can be requested. ESS `GET /ess/leave/types` and balance calculations read this master; this endpoint is the admin view of every row. |
| `settings/` | `POST /settings/leave-config` | `settings.controller.ts` | Class guards; `@RequirePermissions('settings.leave:write')` | Replaces leave-type master rows for the organization (`UpdateLeaveConfigurationsDto`). Changing a type’s rules affects future applications and previews. Existing approved leave is not recalculated by this call alone. |
| `settings/` | `GET /settings` | `settings.controller.ts` | Class guards; `@RequireAnyPermission` of `settings.organization:read`, `settings.employees:read`, `settings.departments:read`, `settings.designations:read`, `settings.attendance:read`, `settings.timesheet:read`, `settings.locations:read`, `settings.leave:read` | Dumps every organization setting key/value. Useful for an admin “all settings” debug view or a client that hydrates many forms at once. Any one of the listed read permissions is enough, so a department-only admin can receive keys outside departments. Prefer the specific GET routes when the UI should stay least-privilege. |
| `settings/` | `GET /settings/:key` | `settings.controller.ts` | Class guards; same `@RequireAnyPermission` read set as `GET /settings` | Reads one setting by its storage key (example `org.name`). Reserved path keys are rejected with `400` so a client cannot treat `profile` or `attendance` as a generic key. Use the typed routes for structured settings; use this for a single miscellaneous key. |
| `settings/` | `POST /settings` | `settings.controller.ts` | Class guards; `@RequireAnyPermission` of the matching `:write` permissions (`settings.organization:write` through `settings.leave:write`) | Generic upsert of one setting key and value (`CreateSettingDto`). Any one write permission in that set allows the call, so it is a broad admin escape hatch. Structured screens should call the typed POST routes (`/settings/profile`, `/settings/attendance`, and so on) so validation stays on the DTO. |

### Organization calendar (`settings/organization-calendar.controller.ts`)

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Holidays created here are what ESS holiday grids and leave-day previews exclude once the calendar year is published.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `settings/` | `GET /settings/organization/calendar` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:read')` | Organization holiday calendar for a year (`GetOrganizationCalendarQueryDto.year`), including holiday rows and whether that year is published. Admins open this before editing; employees do not use this route — they use `GET /ess/holidays`. |
| `settings/` | `POST /settings/organization/calendar/holidays` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Adds one holiday (`CreateCalendarHolidayDto`: date, name, and any location/optional flags the DTO carries). Use for a single correction after bulk import. Unpublished holidays are not yet the employee-facing calendar. |
| `settings/` | `POST /settings/organization/calendar/holidays/bulk` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Creates or overwrites the holiday set for a year (`BulkUpsertCalendarHolidaysDto`). The yearly setup flow uses this to paste or import a regional holiday list in one request instead of posting each date. |
| `settings/` | `PATCH /settings/organization/calendar/holidays/:id` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Edits one holiday’s date, name, or flags (`UpdateCalendarHolidayDto`). UUID is required. |
| `settings/` | `DELETE /settings/organization/calendar/holidays/:id` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Removes one holiday. If the year was already published, employees will stop seeing that date as a holiday after the change; republish if the product requires an explicit publish to refresh the ESS view. |
| `settings/` | `POST /settings/organization/calendar/publish` | `organization-calendar.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Publishes the calendar for a year (`PublishOrganizationCalendarDto.year`). Publishing is the gate that makes the holiday list official for ESS holiday browsing and for leave-day math that skips holidays. Draft edits stay internal until this is called. |

### Expense policy (implemented in `ess/expense/ess-expense.controller.ts`, mounted under `settings/expense`)

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `settings/` | `GET /settings/expense/categories` | `ess-expense.controller.ts` (`ExpenseSettingsController`) | Class guards; `@RequirePermissions('settings.expense:read')` | Admin list of all expense categories, including inactive ones. Each category has a code, name, description, active flag, optional receipt threshold, per-line cap, and claim window. Employees only see active categories on `GET /ess/expense/categories`. |
| `settings/` | `POST /settings/expense/categories` | `ess-expense.controller.ts` (`ExpenseSettingsController`) | Class guards; `@RequirePermissions('settings.expense:write')` | Replaces the category catalog (`UpdateExpenseCategoriesDto`). Items may include an id to update in place. Finance/HR uses this to add “Travel” or “Meals,” set when a receipt is mandatory, and cap a single line. Claim submit validates lines against the active catalog and these limits. |
| `settings/` | `GET /settings/expense/policy` | `ess-expense.controller.ts` (`ExpenseSettingsController`) | Class guards; `@RequirePermissions('settings.expense:read')` | Organization-wide expense defaults: default claim window in days, maximum lines per claim, and maximum claim amount. Shown on the expense settings screen and enforced when an employee submits a claim. |
| `settings/` | `POST /settings/expense/policy` | `ess-expense.controller.ts` (`ExpenseSettingsController`) | Class guards; `@RequirePermissions('settings.expense:write')` | Updates those defaults (`UpdateExpensePolicyDto`). Window is 1–3650 days, max lines 1–200, max amount is a numeric string. Tightening the policy blocks future submits that exceed it; it does not reopen paid claims. |

### Performance assessment master (`ess/performance/performance-master.controller.ts`)

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `settings/` | `GET /settings/performance/master` | `performance-master.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequirePermissions('settings.performance:read')` | Reads the organization’s performance form definition (sections, questions, rating options). The service auto-seeds defaults the first time a tenant opens it, so a new company gets a usable template without a manual import. HR settings and the ESS assessment renderer both depend on this master. |
| `settings/` | `PUT /settings/performance/master` | `performance-master.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequirePermissions('settings.performance:write')` | Bulk-replaces the assessment master (`UpdatePerformanceMasterDto`): rating labels and weights, questions, and sections including custom RBAC role sections. This defines what an employee fills in on self-assessment and what manager, HR, and custom roles later score. Replacing the master affects new and in-progress cycles that read the template; coordinate the change with open assessment periods. |

### Skill catalog admin (`skills/skill-master.controller.ts`, mounted at `settings/skills`)

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Deletes are soft deletes so historical employee-skill rows can still resolve a name.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `skills/` | `GET /settings/skills/categories` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:read')` | Lists skill categories (top level of the catalog, for example “Engineering” or “Language”). The settings tree and HR skill search filters start here. |
| `skills/` | `POST /settings/skills/categories` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Creates a category (`CreateSkillCategoryDto`). Returns the category and a success message. Categories must exist before subcategories and skills can be filed under them. |
| `skills/` | `PUT /settings/skills/categories/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Renames or otherwise updates a category (`UpdateSkillCategoryDto`). |
| `skills/` | `DELETE /settings/skills/categories/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Soft-deletes a category so it disappears from pickers. Prefer this to hard removal when employees already have skills in the category. |
| `skills/` | `GET /settings/skills/subcategories` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:read')` | Lists subcategories, optionally filtered (`ListSkillSubcategoriesQueryDto`, typically by category). Used to build the second level of the catalog tree. |
| `skills/` | `POST /settings/skills/subcategories` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Creates a subcategory under a category (`CreateSkillSubcategoryDto`). |
| `skills/` | `PUT /settings/skills/subcategories/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Updates a subcategory (`UpdateSkillSubcategoryDto`), including rename or re-parent if the DTO allows it. |
| `skills/` | `DELETE /settings/skills/subcategories/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Soft-deletes a subcategory. |
| `skills/` | `GET /settings/skills/items` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:read')` | Lists individual skills (`ListSkillsQueryDto` can filter by category or subcategory). These are the rows employees attach to their profile and that HR searches. |
| `skills/` | `POST /settings/skills/items` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Creates a skill under the catalog (`CreateSkillDto`). Once active, it appears in `GET /ess/skills/catalog` and `GET /hr/skills/catalog`. |
| `skills/` | `PUT /settings/skills/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Updates one skill (`UpdateSkillDto`): name, subcategory, active flag. The path is `/:id` on the `settings/skills` controller, not under `/items`. |
| `skills/` | `DELETE /settings/skills/:id` | `skill-master.controller.ts` | Class guards; `@RequirePermissions('settings.skills:write')` | Soft-deletes a skill so new profiles cannot add it. Existing employee-skill rows remain for history. |

---

## `ess/home/` — employee landing

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/home/` | `GET /ess/home` | `ess-home.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequireAnyPermission('dashboard.ess:read', 'ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read')` | Employee home dashboard in one round trip. Returns a greeting, a static quote, today’s attendance snapshot, upcoming holidays, the employee’s pending leave count, today’s timesheet snapshot, and placeholder payroll tiles (CTC payslip, IT declaration, proof-of-investment copy). If the caller has `approvals.leave:read`, it also includes how many leave requests are waiting on them; if they have `approvals.timesheet:read`, the same for timesheets. Any one of the four listed permissions is enough to open the page, which is why a leave-only or attendance-only role can still land here. This is the ESS home, not `GET /dashboard/hr`. |

---

## `ess/leave/` — balances, applications, and calendar

Two controllers share the prefix `ess/leave`: `ess-leave.controller.ts` (self-service apply) and `ess-leave-calendar.controller.ts` (calendar and team widgets). Both use class guards `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/leave/` | `GET /ess/leave/balances` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | The signed-in employee’s leave balances for a year (`GetLeaveBalancesQueryDto.year`) plus the HR policy rules that explain those numbers. The leave home screen uses this for the balance cards (available, used, pending). Balances are computed for the caller only; managers do not see other people here. |
| `ess/leave/` | `GET /ess/leave/balances/:leaveConfigurationId` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Drill-down for one leave type: summary KPIs, a monthly chart, and the transaction ledger (accruals, applications, adjustments) for the year. Opened when the employee taps a balance card. `leaveConfigurationId` is the leave-type master id from settings. |
| `ess/leave/` | `GET /ess/leave/preview-days` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Live preview while the apply form is filled in (`PreviewLeaveDaysQueryDto`: type, from, to, half-day flags as the DTO defines). Returns how many working days the range consumes after weekends and published holidays, and how the balance would change. The UI calls this before submit so the employee sees insufficient-balance or policy errors early. It does not create a request. |
| `ess/leave/` | `GET /ess/leave/types` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Leave types the employee is allowed to book, plus the approver chain that will receive the request. Driven by leave configuration for the employee’s branch and by the reporting manager. The apply form’s type dropdown is this list, not the raw admin master. |
| `ess/leave/` | `GET /ess/leave/colleagues` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Search of active colleagues (`SearchColleaguesQueryDto`) used to Cc people on a leave request so they are notified. Does not include the caller. This is a notification picker, not the people directory. |
| `ess/leave/` | `GET /ess/leave/requests` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | The caller’s own leave requests filtered by status (`GetLeaveRequestsQueryDto`, typically pending vs history). Powers “My requests.” It does not list requests the caller must approve; that queue is `GET /ess/approvals/leave`. |
| `ess/leave/` | `POST /ess/leave/requests` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:apply')` | Submits a leave request (`CreateLeaveRequestDto`) after policy checks: balance, overlapping requests, notice period, attachment rules, and approver resolution. On success the request is pending and the approver is notified. Read permission is not enough; the role needs the apply grant. Supporting files are uploaded separately through storage and referenced by the DTO. |
| `ess/leave/` | `POST /ess/leave/requests/:id/withdraw` | `ess-leave.controller.ts` | Class guards; `@RequirePermissions('ess.leave:apply')` | Withdraws the caller’s own pending request. Approved or rejected requests cannot be withdrawn here. Use this when plans change before the manager acts. Balance that was tentatively held is released according to the service rules. |
| `ess/leave/` | `GET /ess/leave/calendar` | `ess-leave-calendar.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Month grid markers (`year`, `month`, `filter` default `me`). `me` shows the caller’s leave; other filter values the DTO allows show a wider set (team or scope) for the calendar view. The leave calendar page paints days that have leave without loading full request payloads. |
| `ess/leave/` | `GET /ess/leave/transactions` | `ess-leave-calendar.controller.ts` | Class guards; `@RequirePermissions('ess.leave:read')` | Leave events on one date (`date`, `filter` default `me`, optional `search`). Used when the user clicks a day on the calendar and needs the list of requests or people off that day. |
| `ess/leave/` | `GET /ess/leave/team-on-leave` | `ess-leave-calendar.controller.ts` | Class guards; `@RequirePermissions('dashboard.ess.team-on-leave:read')` | “Team on leave” widget for the ESS home: approved leave for people inside the caller’s access scope (not only direct reports, unless scope says so). Separate from `ess.leave:read` so directory-wide leave visibility can be granted without giving someone the whole leave module. |
| `ess/leave/` | `GET /ess/leave/team-on-leave/chart` | `ess-leave-calendar.controller.ts` | Class guards; `@RequirePermissions('dashboard.ess.team-on-leave:read')` | Chart series and per-day breakdown for a date range (`from`, `to`, optional `type`). Managers use this to see coverage gaps across a sprint or month. |
| `ess/leave/` | `GET /ess/leave/team-on-leave/chart/export` | `ess-leave-calendar.controller.ts` | Class guards; `@RequirePermissions('dashboard.ess.team-on-leave:read')` | Same dataset as the chart, streamed as UTF-8 CSV with a `Content-Disposition` attachment filename. Used for workforce planning exports. |

---

## `ess/holidays/` — published holiday grid

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/holidays/` | `GET /ess/holidays` | `ess-holidays.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequirePermissions('ess.leave:read')` | Employee holiday calendar for a year (`GetYearQueryDto.year`, default current year), grouped as a month grid from the published organization calendar and scoped to the employee (branch/location rules the service applies). The Holidays page and the home “upcoming holidays” strip read this. Employees cannot add holidays here; that is `settings/organization/calendar`. |

---

## `ess/attendance/` — punches, regularization, and roster

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Web sign-in stores latitude, longitude, client IP (first `X-Forwarded-For` hop, else socket address), and an optional location label. Biometric punches arrive through `/iclock` and show up in the same attendance data.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/attendance/` | `POST /ess/attendance/sign-in` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:punch')` | Records an IN punch for the signed-in employee (`SignInPunchDto`: latitude, longitude, optional `signInLocation`). Used by the web/mobile “Sign in” button when the company allows self punches in addition to biometric devices. The service applies shift rules from attendance settings (duplicate punch, geofence if configured, already signed in). |
| `ess/attendance/` | `POST /ess/attendance/sign-out` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:punch')` | Records an OUT punch (`SignPunchDto` with coordinates). Closes the day’s open session and feeds the daily summary (hours, late, out). Call this when the employee leaves; biometric OUT swipes do the same from the device pipeline. |
| `ess/attendance/` | `GET /ess/attendance/regularization` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.regularization:apply')` | The caller’s own regularization requests, filterable by status. Regularization is how an employee explains a missing or wrong punch (forgot to sign out, device offline, on duty outside the office). This list is the employee’s tracker, not the approver inbox. |
| `ess/attendance/` | `POST /ess/attendance/regularization` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.regularization:apply')` | Submits a regularization request (`CreateAttendanceRegularizationDto`: the work date, proposed in/out, and reason). Creates a pending item for the reporting manager. It does not change the official punch until approved. |
| `ess/attendance/` | `POST /ess/attendance/regularization/:id/withdraw` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.regularization:apply')` | Withdraws a still-pending regularization request owned by the caller. After approval, corrections go through a new request rather than this endpoint. |
| `ess/attendance/` | `GET /ess/attendance/today` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:read')` | Today’s status for the home widget: whether the employee is signed in, last punch, and the day’s current classification. Also embedded inside `GET /ess/home`. |
| `ess/attendance/` | `GET /ess/attendance/summary` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:read')` | Monthly metrics for the caller (`year` and `month` default to now): present, absent, late, leave, and the other counters `getSummary` computes. The attendance summary cards use this. |
| `ess/attendance/` | `GET /ess/attendance/days` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:read')` | Month calendar markers for the caller’s own attendance (status per day). The calendar paints colors from this; the day drawer then calls `GET /ess/attendance/days/:date`. |
| `ess/attendance/` | `GET /ess/attendance/days/:date` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance:read')` | Full detail for one day (`YYYY-MM-DD`, otherwise `400`): punches, computed status, shift, and exceptions. `date` is declared after `swipes` and `who-is-in` so those static segments are not parsed as dates. |
| `ess/attendance/` | `GET /ess/attendance/swipes` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.swipes:read')` | Paginated swipe (punch) history for employees inside the caller’s access scope (`from`, `to`, `q`, `punchType`, `page`, `pageSize`). HR and managers use this to investigate a person’s biometric or web punches. It is broader than the caller’s own day detail, which only needs `ess.attendance:read`. |
| `ess/attendance/` | `GET /ess/attendance/swipes/export` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.swipes:read')` | CSV download of the same swipe query (without pagination), UTF-8, attachment filename. Used for payroll audits and device-vs-web punch reconciliation. |
| `ess/attendance/` | `GET /ess/attendance/who-is-in` | `ess-attendance.controller.ts` | Class guards; `@RequirePermissions('dashboard.ess.who-is-in:read')` | Roster for a work date (`GetWhoIsInQueryDto.date`) bucketed into not yet in, late, on time, and out of office, limited by access scope. The “Who is in” dashboard widget polls this during the day. Separate permission so it can be given to reception or team leads without full swipe export. |
| `biometric/` | `GET /ess/attendance/live` | `biometric-admin.controller.ts` | `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`; `@RequirePermissions('ess.attendance.live:read')` | Polling feed of recent biometric punches (`since` cursor, `limit` default 50). A live attendance board calls this on an interval to show swipes as devices post them. Web sign-in punches are not the subject of this feed; device ingest is. Listed with attendance because the path is under `ess/attendance`, while the controller lives in `biometric/`. |

---

## `ess/approvals/` — manager action queues

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Each queue is limited to requests the caller is allowed to act on (typically the assigned approver / reporting manager), not every pending request in the company. Expense approvals are a separate controller at `ess/approvals/expense`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/approvals/` | `GET /ess/approvals/leave` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.leave:read')` | Leave requests waiting on the current user. The approvals inbox and the home pending-approval count use this. An employee with only `ess.leave:apply` does not see colleagues’ requests. |
| `ess/approvals/` | `GET /ess/approvals/leave/:id` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.leave:read')` | Manager review detail: dates, type, balance impact, reason, Cc, and attachment metadata. The UI opens this from the inbox before approve or reject. |
| `ess/approvals/` | `GET /ess/approvals/leave/:id/document` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.leave:read')` | Download or signed access to the supporting document on that leave request (medical note, travel proof). Only the approver who can open the request can fetch it. |
| `ess/approvals/` | `POST /ess/approvals/leave/:id/approve` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.leave:act')` | Approves a pending leave request. Optional notes (`ApproveApprovalDto`). Deducts or confirms balance, notifies the employee, and removes the item from the pending queue. Read permission alone cannot approve. |
| `ess/approvals/` | `POST /ess/approvals/leave/:id/reject` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.leave:act')` | Rejects a pending request. `RejectApprovalDto.reason` is required by the DTO’s validation. The employee is notified and the balance is not consumed as approved leave. |
| `ess/approvals/` | `GET /ess/approvals/attendance-regularization` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.attendance:read')` | Regularization requests waiting on the current user. Managers use this to correct forgotten punches without editing raw swipe logs themselves. |
| `ess/approvals/` | `GET /ess/approvals/attendance-regularization/:id` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.attendance:read')` | Detail for one regularization: original punches versus the requested in/out and the employee’s reason. |
| `ess/approvals/` | `POST /ess/approvals/attendance-regularization/:id/approve` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.attendance:act')` | Approves the correction and applies it to the day’s attendance (optional notes). After this, summaries and “who is in” reflect the regularized times. |
| `ess/approvals/` | `POST /ess/approvals/attendance-regularization/:id/reject` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.attendance:act')` | Rejects the correction with a reason. Official punches stay as they were. |
| `ess/approvals/` | `GET /ess/approvals/timesheet` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:read')` | Submitted timesheet days waiting on the current user. This is the pending inbox, not the full team calendar. |
| `ess/approvals/` | `GET /ess/approvals/timesheet/team` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:read')` | Team timesheet days for manager review across statuses and a date window (`TeamTimesheetQueryDto`). Declared before `timesheet/:id` so `team` is not parsed as an id. Used by the team timesheet grid. |
| `ess/approvals/` | `POST /ess/approvals/timesheet/bulk-approve` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:act')` | Approves many submitted days in one call (`BulkApproveTimesheetDto`). Managers use this at week end instead of opening each day. Only days the caller is allowed to approve are processed. |
| `ess/approvals/` | `GET /ess/approvals/timesheet/:id` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:read')` | One submitted day with its time entries and categories, for the review drawer. |
| `ess/approvals/` | `POST /ess/approvals/timesheet/:id/approve` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:act')` | Approves a single submitted day. The employee can no longer reopen it through the normal edit path once it is approved, unless product rules say otherwise in the service. |
| `ess/approvals/` | `POST /ess/approvals/timesheet/:id/reject` | `ess-approvals.controller.ts` | Class guards; `@RequirePermissions('approvals.timesheet:act')` | Rejects a submitted day with a reason so the employee can correct and resubmit. |

---

## `ess/timesheet/` — daily time entry

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Dates are `YYYY-MM-DD` or the handler returns `400`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/timesheet/` | `GET /ess/timesheet/settings` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:read')` | Read-only timesheet rules for the employee (the projection of organization timesheet settings: deadlines, backdating, required fields). The entry screen loads this to enable or disable submit and to show policy hints. Employees cannot change rules here. |
| `ess/timesheet/` | `GET /ess/timesheet/categories` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:read')` | Active categories for the entry form dropdown. Inactive admin categories are omitted. |
| `ess/timesheet/` | `GET /ess/timesheet/reports` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:read')` | Aggregated timesheet report for the caller (`TimesheetReportQueryDto`: daily, weekly, or monthly windows). Used by the report charts, not the editable day form. |
| `ess/timesheet/` | `GET /ess/timesheet/report-entries` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:read')` | Flat entry rows for the “My report” table (`TimesheetEntryReportQueryDto`): one row per time line so the UI can sort and filter without reconstructing days. |
| `ess/timesheet/` | `GET /ess/timesheet/days/:date` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:read')` | The caller’s timesheet for one date: status (draft, submitted, approved, rejected), entries, and totals. Opening a day on the calendar calls this. |
| `ess/timesheet/` | `PUT /ess/timesheet/days/:date` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:write')` | Creates or replaces the day’s entries (`UpsertTimesheetDayDto`) either as a draft save or as a submit, depending on the DTO flag. Submit runs policy checks (category required, hours vs attendance, deadline). Submitted days move to the manager queue. |
| `ess/timesheet/` | `POST /ess/timesheet/days/:date/reopen` | `ess-timesheet.controller.ts` | Class guards; `@RequirePermissions('ess.timesheet:write')` | Pulls a submitted (not yet finally approved) day back to draft so the employee can edit. Used when they notice a mistake before the manager approves. Approved days are rejected by the service. |

---

## `ess/notifications/` — in-app alerts

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Every route uses the same `@RequireAnyPermission('ess.leave:read', 'ess.attendance:read', 'ess.timesheet:read', 'ess.expense:read')` so anyone who can use at least one of those ESS modules can see alerts. Notifications are always for `req.user.sub` only.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/notifications/` | `GET /ess/notifications` | `ess-notifications.controller.ts` | Class guards; any of the four ESS read permissions above | Lists the signed-in employee’s notifications (leave decisions, approval requests, expense status, attendance outcomes — whatever the services write into `employee_notification`). The header drawer calls this when opened. |
| `ess/notifications/` | `GET /ess/notifications/unread-count` | `ess-notifications.controller.ts` | Class guards; same any-permission | Unread count for the header badge. Polled so the badge can update without loading full message bodies. Declared before `/:id/read` so `unread-count` is not captured as an id. |
| `ess/notifications/` | `PATCH /ess/notifications/read-all` | `ess-notifications.controller.ts` | Class guards; same any-permission | Marks every notification for this employee as read. “Mark all as read” in the drawer. |
| `ess/notifications/` | `PATCH /ess/notifications/:id/read` | `ess-notifications.controller.ts` | Class guards; same any-permission | Marks one notification read when the employee opens it. The id must belong to the caller; another employee’s notification id will not be updated. |

---

## `ess/expense/` — claims, manager approval, and finance

All four controllers in `ess-expense.controller.ts` use `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. A claim moves draft → submitted (manager) → finance → approved/payable → paid, with reject and send-back branches. Receipts are stored via `POST /storage/upload` and read back through the receipt routes, which check the caller’s relationship to the claim (`owner`, `manager`, or `finance`).

### Employee claims

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/expense/` | `GET /ess/expense/categories` | `ess-expense.controller.ts` (`EssExpenseController`) | Class guards; `@RequirePermissions('ess.expense:read')` | Active expense categories for the claim form. Inactive and admin-only fields stay on `GET /settings/expense/categories`. The employee picks a category per line; receipt-required and caps are enforced later on submit. |
| `ess/expense/` | `GET /ess/expense/claims` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:read')` | The caller’s claims, optional `status` query (`ExpenseClaimStatus`). “My expenses” lists drafts, pending, sent back, approved, rejected, and paid from this endpoint. |
| `ess/expense/` | `GET /ess/expense/claims/:id` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:read')` | One of the caller’s claims with lines, totals, status history, and receipt metadata. Opening a claim from the list uses this. Other employees’ claims return not found / forbidden from the service. |
| `ess/expense/` | `POST /ess/expense/claims` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Creates a draft claim (`CreateExpenseClaimDto`: title, period, or the header fields the DTO defines). A draft is private to the employee and is not in a manager queue until submit. |
| `ess/expense/` | `PATCH /ess/expense/claims/:id` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Updates header fields on a draft or a claim that was sent back (`UpdateExpenseClaimDto`). Submitted and approved claims are locked by the service. |
| `ess/expense/` | `POST /ess/expense/claims/:id/lines` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Adds a line (`CreateExpenseClaimLineDto`: date, category, amount, description, optional receipt reference). Only draft or sent-back claims accept new lines. Amounts are validated as money strings. |
| `ess/expense/` | `PATCH /ess/expense/claims/:id/lines/:lineId` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Edits one line on a draft or sent-back claim. |
| `ess/expense/` | `DELETE /ess/expense/claims/:id/lines/:lineId` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Removes a line and its receipt association from a draft or sent-back claim. |
| `ess/expense/` | `POST /ess/expense/claims/:id/submit` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Submits the claim to the manager. The service checks policy: at least one line, max lines, max claim amount, per-category caps, receipt required above the category threshold, and the claim window (expense date not older than allowed days). On success the claim leaves draft and the approver is notified. |
| `ess/expense/` | `POST /ess/expense/claims/:id/withdraw` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:apply')` | Withdraws or cancels a claim the employee still controls (draft or pending, per service rules). Use this when the trip is cancelled before finance pays. |
| `ess/expense/` | `GET /ess/expense/claims/:id/lines/:lineId/receipt/preview` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:read')` | Short-lived inline preview URL for the caller’s own receipt on that line. The claim UI shows the image or PDF in a viewer without downloading. |
| `ess/expense/` | `GET /ess/expense/claims/:id/lines/:lineId/receipt` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('ess.expense:read')` | Download URL (or file payload) for the caller’s own receipt. |

### Manager queue (`EssExpenseApprovalsController`)

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/expense/` | `GET /ess/approvals/expense` | `ess-expense.controller.ts` (`EssExpenseApprovalsController`) | Class guards; `@RequirePermissions('approvals.expense:read')` | Claims pending the current user’s manager approval. This is the first human gate after submit. Finance does not use this list. |
| `ess/expense/` | `GET /ess/approvals/expense/:id` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:read')` | Full claim for manager review, including lines the manager is allowed to see. |
| `ess/expense/` | `GET /ess/approvals/expense/:id/lines/:lineId/receipt/preview` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:read')` | Receipt preview in the manager role. The service checks the caller is the approver for that claim before signing the URL. |
| `ess/expense/` | `GET /ess/approvals/expense/:id/lines/:lineId/receipt` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:read')` | Receipt download for the manager review. |
| `ess/expense/` | `POST /ess/approvals/expense/:id/approve` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:act')` | Manager approves and forwards the claim toward finance (optional notes). Does not mark the claim paid. |
| `ess/expense/` | `POST /ess/approvals/expense/:id/reject` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:act')` | Manager rejects with a reason. The employee is notified; the claim does not proceed to finance. |
| `ess/expense/` | `POST /ess/approvals/expense/:id/send-back` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('approvals.expense:act')` | Returns the claim to the employee for correction (`SendBackExpenseDto.reason`) without a hard reject. The employee can edit lines again and resubmit. |

### Finance queue (`EssExpenseFinanceController`)

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/expense/` | `GET /ess/expense/finance/pending` | `ess-expense.controller.ts` (`EssExpenseFinanceController`) | Class guards; `@RequirePermissions('expense.finance:read')` | Claims that passed manager approval and are waiting for finance. Company-wide for this permission, not limited to the caller’s direct reports. Static path `pending` is declared before `:id`. |
| `ess/expense/` | `GET /ess/expense/finance/payable` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:read')` | Claims finance has approved and that are ready to pay. The accounts payable worklist. |
| `ess/expense/` | `GET /ess/expense/finance/export` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:read')` | CSV of approved and/or paid claims. Query `status` is `APPROVED`, `PAID`, or `BOTH`. The handler returns `{ csv }` (string payload, not a file stream). Finance imports this into the payment run or ERP. |
| `ess/expense/` | `GET /ess/expense/finance/:id` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:read')` | Claim detail for a finance reviewer, including lines and audit. |
| `ess/expense/` | `GET /ess/expense/finance/:id/lines/:lineId/receipt/preview` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:read')` | Receipt preview as finance, after the service confirms the finance relationship. |
| `ess/expense/` | `GET /ess/expense/finance/:id/lines/:lineId/receipt` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:read')` | Receipt download for finance audit. |
| `ess/expense/` | `POST /ess/expense/finance/:id/approve` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:act')` | Finance approval (optional notes). Moves the claim to the payable set. This is a second approval after the manager, not the payment itself. |
| `ess/expense/` | `POST /ess/expense/finance/:id/reject` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:act')` | Finance rejects with a reason (policy, duplicate, missing receipt). |
| `ess/expense/` | `POST /ess/expense/finance/:id/send-back` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:act')` | Finance sends the claim back for correction with a reason. |
| `ess/expense/` | `POST /ess/expense/finance/:id/mark-paid` | `ess-expense.controller.ts` | Class guards; `@RequirePermissions('expense.finance:act')` | Records that an approved claim was paid (`MarkExpensePaidDto`: payment reference, date, mode as the DTO defines). Closes the reimbursement. Only claims already approved for payment should succeed. |

---

## `ess/performance/` — assessment cycles

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. The form structure comes from `GET /settings/performance/master`. A cycle is assigned by HR, filled by the employee, then reviewed by the manager, HR, and any custom RBAC role sections.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `ess/performance/` | `GET /ess/performance/assessments` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('ess.performance:read')` | Assessments assigned to the signed-in employee (cycle name, status, due context). The “My reviews” list. Does not include reports the caller must review. |
| `ess/performance/` | `GET /ess/performance/assessments/reviews` | `ess-performance.controller.ts` | Class guards; `@RequireAnyPermission('performance.hr:read', 'performance.review:read')` | Team or organization assessments for manager or HR review (`ListReviewAssessmentsQueryDto` filters status, cycle, or search as defined). Declared before `assessments/:id` so `reviews` is not an id. HR read sees the org queue; manager review read sees the team queue the service scopes. |
| `ess/performance/` | `GET /ess/performance/assessments/:id` | `ess-performance.controller.ts` | Class guards; `@RequireAnyPermission('ess.performance:read', 'performance.review:read', 'performance.hr:read')` | One assessment with answers and header context (employee, cycle, section status). The service only returns it if the caller is the subject, the reviewing manager, or HR. Any one of the three read permissions is necessary but not sufficient — relationship is still checked. |
| `ess/performance/` | `PUT /ess/performance/assessments/:id/draft` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('ess.performance:write')` | Saves the employee’s self-assessment answers without submitting (`SaveAssessmentDraftDto`). Autosave on the form uses this. Only the assessment subject can write the self section, and only while it is still editable. |
| `ess/performance/` | `POST /ess/performance/assessments/:id/submit` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('ess.performance:write')` | Submits the self-assessment (same answer body). Locks the employee section and opens the manager-review stage. Required questions are validated on submit, not on draft. |
| `ess/performance/` | `PUT /ess/performance/assessments/:id/manager-review` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('performance.review:act')` | Manager writes the manager-review section (`ReviewAssessmentDto`: ratings and comments). The caller must be the assigned reviewing manager. This does not replace HR feedback. |
| `ess/performance/` | `PUT /ess/performance/assessments/:id/hr-review` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('performance.hr:act')` | HR writes the HR-feedback section and can close the cycle according to the service. Separate from manager review so HR commentary stays a distinct step. |
| `ess/performance/` | `PUT /ess/performance/assessments/:id/role-review/:roleCode` | `ess-performance.controller.ts` | Class guards; `@RequireAnyPermission('ess.performance:read', 'performance.review:read', 'performance.hr:read')` | Saves answers for a custom section bound to an RBAC role code (the master can define sections beyond employee, manager, and HR). The service checks the caller actually holds `roleCode`. The route’s permission decorator is a read-level any-of gate; the real write authority is the role match inside the service. |
| `ess/performance/` | `POST /ess/performance/assessments` | `ess-performance.controller.ts` | Class guards; `@RequirePermissions('performance.hr:act')` | HR assigns an assessment cycle to an employee (`CreateAssessmentDto`: who, which cycle/template window). This is how a review period starts. Employees cannot create their own assessments. |

---

## `skills/` — employee profile and HR search

Catalog administration is listed under settings (`/settings/skills`). These routes are the runtime skill profile.

### Employee self-service

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `skills/` | `GET /ess/skills/catalog` | `ess-skills.controller.ts` | Class guards; `@RequirePermissions('ess.skills:read')` | Active category / subcategory / skill tree for the employee picker. Soft-deleted or inactive skills are omitted so people cannot add retired skills. |
| `skills/` | `GET /ess/skills` | `ess-skills.controller.ts` | Class guards; `@RequirePermissions('ess.skills:read')` | Skills on the signed-in employee’s profile: skill, years of experience, and proficiency. The “My skills” page. |
| `skills/` | `POST /ess/skills` | `ess-skills.controller.ts` | Class guards; `@RequirePermissions('ess.skills:write')` | Adds a catalog skill to the caller’s profile (`CreateEmployeeSkillDto`: skill id, experience, proficiency). Duplicate adds are rejected by the service. HR search starts returning this person for that skill after the add. |
| `skills/` | `PUT /ess/skills/:id` | `ess-skills.controller.ts` | Class guards; `@RequirePermissions('ess.skills:write')` | Updates experience and proficiency on one of the caller’s skill rows (`UpdateEmployeeSkillDto`). `:id` is the employee-skill assignment id, not the catalog skill id. |
| `skills/` | `DELETE /ess/skills/:id` | `ess-skills.controller.ts` | Class guards; `@RequirePermissions('ess.skills:write')` | Removes a skill from the caller’s profile. They can add it again later from the catalog. |

### HR skill search

Same class guards. Results are limited by `employees.skills:read` visibility scope.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `skills/` | `GET /hr/skills/catalog` | `hr-skills.controller.ts` | Class guards; `@RequirePermissions('employees.skills:read')` | Active catalog for HR filter chips (which skills can be searched). Same underlying catalog as ESS, exposed under the HR permission so a recruiter role need not hold `ess.skills:read`. |
| `skills/` | `GET /hr/skills/employees` | `hr-skills.controller.ts` | Class guards; `@RequirePermissions('employees.skills:read')` | Search employees by name, employee code, and skill filters (`SearchHrSkillsQueryDto`), inside the caller’s scope. Staffing and project staffing use this to find “people who know X at proficiency Y.” |
| `skills/` | `GET /hr/skills/employees/:id` | `hr-skills.controller.ts` | Class guards; `@RequirePermissions('employees.skills:read')` | Read-only skill profile for one employee. Out-of-scope ids are rejected by the scope check before the profile is returned. HR cannot edit another person’s skills through this module; the employee maintains their own via `/ess/skills`. |

---

## `document-centre/` — policies, forms, and Form 16

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Reads accept either `ess.documents:read` (employee: own Form 16 plus public policies/forms) or `documents:read` (HR: the managed library). `canManageAll` is computed per request and widens the list and download scope for document administrators. Uploads are multipart, held in memory, and capped by `DOCUMENT_CENTRE_MAX_FILE_BYTES`.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `document-centre/` | `GET /document-centre/documents` | `document-centre.controller.ts` | Class guards; `@RequireAnyPermission('ess.documents:read', 'documents:read')` | Lists documents the caller may see (`ListDocumentsQueryDto`: category, subcategory, search, employee, year). Employees see published policies, company forms, and their own Form 16. Users who `canManageAll` see the admin library. This is the Document Centre grid, separate from onboarding documents stored on the employee record. |
| `document-centre/` | `GET /document-centre/documents/:id/download` | `document-centre.controller.ts` | Class guards; same any-permission | Signed download URL for one document, after the same visibility check as the list. Use for “Download.” A Form 16 for another employee is denied unless the caller can manage all documents. |
| `document-centre/` | `GET /document-centre/documents/:id/preview` | `document-centre.controller.ts` | Class guards; same any-permission | Signed inline preview URL (PDF/image in the browser) with the same authorization as download. |
| `document-centre/` | `PATCH /document-centre/documents/:id` | `document-centre.controller.ts` | Class guards; `@RequirePermissions('documents:write')` | Updates metadata (`UpdateDocumentDto`: title, category/subcategory, or publish flags the DTO allows). Does not replace the binary; upload a new document to change the file. |
| `document-centre/` | `DELETE /document-centre/documents/:id` | `document-centre.controller.ts` | Class guards; `@RequirePermissions('documents:write')` | Soft-deletes a document so it disappears from employee and admin lists but can remain in storage for audit until a storage purge. |
| `document-centre/` | `POST /document-centre/policies` | `document-centre.controller.ts` | Class guards; `@RequirePermissions('documents:write')` | Multipart upload of a company policy. Fields: `file`, `title`, `subcategory` (`GENERAL` or `HR`, required). Stored as category `POLICY` and attributed to the uploading employee. Employees with read access can then see it in the policy library. |
| `document-centre/` | `POST /document-centre/forms` | `document-centre.controller.ts` | Class guards; `@RequirePermissions('documents:write')` | Multipart upload of a blank company form (`file`, `title`). Category `FORM`, no subcategory. Used for forms employees download and fill (expense forms, declaration templates) as distinct from policies. |
| `document-centre/` | `POST /document-centre/form16/upload` | `document-centre.controller.ts` | Class guards; `@RequirePermissions('documents:write')` | Multipart Form 16 upload. Fields: `file`, `financialYear` (required), optional `employeeId`. Payroll/HR publishes an employee’s tax certificate for a financial year. When `employeeId` is set, only that employee (and document admins) should see it in the list. |

---

## `storage/` — S3 proxy

Class-level guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Files are uploaded through the API (memory storage, 5 MB interceptor limit on this route) and stored in the tenant’s S3 prefix. The API never exposes raw bucket credentials to the browser.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `storage/` | `POST /storage/upload` | `storage.controller.ts` | Class guards; `@RequireAnyPermission('employees:onboard', 'employees:update', 'ess.leave:apply', 'ess.expense:apply', 'settings.organization:write', 'documents:write')` | Backend proxy upload. Multipart fields: `file` (required), `category`, `module` (required), optional `documentType`, `employeeId`, `leaveRequestId`, `uploadBatchId`. Any one of the listed permissions may call it, and the category/module pair tells the service which feature the object belongs to (onboarding document, leave attachment, expense receipt, organization logo, document centre). Returns the storage key and metadata the caller then saves on the business record. HR onboarding can also send documents as base64 on the employee APIs; this route is the binary path. |
| `storage/` | `GET /storage/documents/:documentId/download` | `storage.controller.ts` | Class guards; `@RequireAnyPermission('employees:read', 'approvals.leave:read', 'ess.leave:read')` | Downloads an employee or leave document by its document id. If the object is in S3, the response is `{ downloadUrl, fileName, mimeType }`. Legacy rows still stored inline return `{ fileName, mimeType, dataBase64 }`. Used by HR viewing onboarding files and by employees or approvers opening a leave attachment. |
| `storage/` | `GET /storage/preview-url` | `storage.controller.ts` | Class guards; `@RequireAnyPermission('employees:read', 'employees:onboard', 'settings.organization:read', 'settings.organization:write')` | Mints a short-lived signed GET URL for an S3 key already stored for this organization. Query: `storageKey` (required) and optional `mimeType` (default `application/octet-stream`). The organization-logo preview and onboarding file preview call this. The service must keep the key inside the tenant prefix so one company cannot sign another company’s objects. |
| `storage/` | `GET /storage/assets/summary` | `storage.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Counts S3 objects stored for the current organization. The settings “storage” panel shows this before offering a purge, so an admin sees how much would be deleted. |
| `storage/` | `DELETE /storage/assets` | `storage.controller.ts` | Class guards; `@RequirePermissions('settings.organization:write')` | Irreversible delete of all S3 assets for the current organization. Body `PurgeOrganizationAssetsDto.confirm` must match the required confirmation phrase or the service refuses. Also clears tenant references the service knows about. Organization settings administrators use this only for tenant offboarding or a deliberate reset, not for deleting one file. |

---

## `biometric/` — devices, identity mapping, and ZKTeco ingress

### Admin and live feed (`biometric-admin.controller.ts`)

Controller has an empty `@Controller()` prefix; each method carries its full path. Class guards: `APP_GUARD`; `TenantAuthGuard`; `SubscriptionGuard`; `PermissionsGuard`. Device rows and mappings are tenant data. Punches that arrive with an unknown biometric id are parked as unmapped until HR binds them.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `biometric/` | `GET /settings/biometric/devices` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.devices:read')` | Lists biometric terminals registered for the tenant (name, serial, site, active flag, last-seen if the service returns it). The device settings page uses this before a terminal is allowed to post attendance. |
| `biometric/` | `POST /settings/biometric/devices` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.devices:write')` | Registers a device (`CreateBiometricDeviceDto`). The actor subject is stored. Until a device is registered, ingest can still receive traffic but the admin inventory will not show it as a managed terminal. |
| `biometric/` | `PUT /settings/biometric/devices/:id` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.devices:write')` | Updates a device (`UpdateBiometricDeviceDto`): rename, move site, enable or disable. Disabling should stop that terminal’s punches from being trusted, according to the ingest service. |
| `biometric/` | `DELETE /settings/biometric/devices/:id` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.devices:write')` | Soft-deletes a device. Optional body `{ reason }` is written to the biometric audit log. Historical punches already stored are not erased. |
| `biometric/` | `GET /settings/biometric/mappings` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.mapping:read')` | Employees and their biometric ids, optional search `q`. HR uses this to see who can punch on the terminal. The biometric id is what the device sends; it is not the employee code unless HR set them equal. |
| `biometric/` | `GET /settings/biometric/mappings/next-id` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.mapping:read')` | Previews the next auto-assigned biometric id (`{ biometricId }`) so the assign form can show a suggested value before save. Does not reserve the id; a concurrent assign can still take it. |
| `biometric/` | `PUT /settings/biometric/mappings/:employeeId` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.mapping:write')` | Assigns or changes the biometric id for one employee (`AssignBiometricIdDto`). After this, new punches with that id attach to the employee and update attendance. Duplicate ids across employees are rejected by the service. |
| `biometric/` | `DELETE /settings/biometric/mappings/:employeeId` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('settings.biometric.mapping:write')` | Clears the employee’s biometric id. Optional `{ reason }` is audited. Later punches with the old id become unmapped until someone binds them again. |
| `biometric/` | `GET /settings/biometric/unmapped` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.unmapped:read')` | Punches whose biometric id did not match an employee, optional `status` filter. This queue is how HR notices a new joiner punched before mapping, or a wrong id on the device. |
| `biometric/` | `POST /settings/biometric/unmapped/:id/resolve` | `biometric-admin.controller.ts` | Class guards; `@RequirePermissions('ess.attendance.unmapped:write')` | Resolves one unmapped punch (`ResolveUnmappedPunchDto`). `action=bind` requires `employeeId` and attaches the punch (and typically the id) to that employee so attendance is corrected. `action=ignore` drops it from the queue without creating attendance. `400` if bind is requested without an employee id. |

`GET /ess/attendance/live` is documented in the attendance section; it is served by this same controller.

### ZKTeco / eSSL ADMS ingress (`zkteco-adms.controller.ts`)

These routes are excluded from Swagger. They do **not** use JWT, `TenantAuthGuard`, `SubscriptionGuard`, or `PermissionsGuard`. `APP_GUARD` still runs, but device calls have no access cookie, so the password-change lock does not apply. Tenant context comes only from `TenantResolverMiddleware`: the device must call the tenant host (or the process must be locked to one subdomain) or `/iclock/cdata` responds `400` plain text `No tenant`. Responses are `text/plain`, which is what ADMS firmware expects. Bodies may be `text/plain` (ATTLOG); `main.ts` raises the text body limit to 2 MB.

| Module Name | HTTP Method & Path | Controller File | Guards Required | Purpose & Use Case |
| --- | --- | --- | --- | --- |
| `biometric/` | `GET /iclock/cdata` | `zkteco-adms.controller.ts` | `APP_GUARD` only. No user authentication. Tenant middleware required. | Device handshake and query-style ADMS calls. ZKTeco and eSSL terminals poll `cdata` with query parameters (serial number, options, stamp). `BiometricIngestService.handleZktecoCdata` answers in the firmware dialect and may record a heartbeat. Same handler as POST. |
| `biometric/` | `POST /iclock/cdata` | `zkteco-adms.controller.ts` | `APP_GUARD` only. No user authentication. Tenant middleware required. | Attendance log upload. The body is ATTLOG (or the vendor’s punch payload). The service parses punches, matches biometric ids to employees, writes attendance punches, and parks unknown ids on the unmapped queue. This is the production path for door and attendance terminals. It must stay unauthenticated because the devices do not hold user JWTs; network placement and tenant host routing are the isolation boundary. |
| `biometric/` | `GET /iclock/getrequest` | `zkteco-adms.controller.ts` | `APP_GUARD` only. No tenant check in the handler. | Firmware command poll. V1 always returns plain `OK` and pushes no commands (no user sync, no reboot, no time set). Devices that poll this stay happy without the server implementing the command queue yet. |
| `biometric/` | `POST /iclock/devicecmd` | `zkteco-adms.controller.ts` | `APP_GUARD` only. No tenant check in the handler. | Device command acknowledgement. V1 returns plain `OK` and ignores the body. Present so firmware that posts command results does not receive a 404. |

---

## Coverage

| Source folder | Controllers | Routes in this document |
| --- | --- | --- |
| `app/` | `app.controller.ts` | 1 |
| `auth/` | `auth.controller.ts`, `tenant-auth.controller.ts` | 9 |
| `organizations/` | `organizations.controller.ts` | 12 |
| `subscriptions/` | `organization-subscription.controller.ts` | 4 |
| `leads/` | `leads.controller.ts` | 1 |
| `employees/` | `employees.controller.ts` | 13 |
| `people/` | `people.controller.ts` | 3 |
| `rbac/` | `rbac.controller.ts` | 11 |
| `hr-dashboard/` | `hr-dashboard.controller.ts` | 1 |
| `settings/` | `settings.controller.ts`, `organization-calendar.controller.ts` | 24 + 6 |
| `ess/` | leave, calendar, holidays, home, attendance, approvals, timesheet, notifications, expense (includes 4 expense-settings routes), performance, performance master | 8 + 5 + 1 + 1 + 12 + 15 + 7 + 4 + 33 + 9 + 2 |
| `skills/` | `skill-master.controller.ts`, `ess-skills.controller.ts`, `hr-skills.controller.ts` | 12 + 5 + 3 |
| `document-centre/` | `document-centre.controller.ts` | 8 |
| `storage/` | `storage.controller.ts` | 5 |
| `biometric/` | `biometric-admin.controller.ts`, `zkteco-adms.controller.ts` | 11 + 4 |

Expense settings (4) are inside the ess expense controller count (33). Skill-catalog admin routes are under `skills/` even though the URL prefix is `settings/skills`. `GET /ess/attendance/live` is one of the 11 biometric-admin routes; it is described in the attendance section because of its path and is not listed a second time under the biometric admin table.

Total controller routes: **230**. Modules with no HTTP controller (`users/`, `database/`, `modules/email/`) are libraries used by these handlers and are not listed as routes.

