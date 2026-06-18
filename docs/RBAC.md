# GhoulHR RBAC Architecture

Two-tier access control for the multi-tenant HRMS.

## Layer 1 — Platform org entitlements (Super Admin)

- **Storage:** Master DB — `platform_modules`, `organization_module_entitlements`
- **Who manages:** `SUPER_ADMIN` via `/organizations/:id/modules`
- **Purpose:** Ceiling on which modules an organization may use (e.g. disable Payroll for Org A)

## Layer 2 — Tenant RBAC (Org Admin)

- **Storage:** Tenant DB — `rbac_roles`, `rbac_permissions`, `rbac_role_permissions`, `rbac_employee_role_assignments`, `rbac_permission_audit_logs`
- **Who manages:** Users with `rbac:manage` via `/rbac/*`
- **Purpose:** Roles and permissions for employees within entitled modules

### Source of truth

RBAC tables (`rbac_employee_role_assignments`, `rbac_role_permissions`) are the **source of truth** for tenant authorization. Legacy fields (`employees.role`, JWT `role`, `portalRoleLabel`) are synced from the primary RBAC assignment for backward compatibility during migration.

### System vs custom roles

- **System roles** (seeded): `ORG_ADMIN`, `HR_ADMIN`, `PAYROLL_ADMIN`, `MANAGER`, `TEAM_LEAD`, `EMPLOYEE`
- **Custom roles**: created by org admins via `POST /rbac/roles`; permissions cloned from system roles or configured via the permission matrix
- `ORG_ADMIN` permissions are immutable; other system roles can be customized but not deactivated

### Permission catalog sync

Permissions are defined in code (`permission-catalog.constant.ts`) and **upserted** on tenant bootstrap. New permissions are automatically linked to `ORG_ADMIN`. Existing tenant customizations to other roles are preserved.

## Effective authorization

```
allow(user, permissionCode) =
  orgHasEntitlement(organizationId, moduleOf(permissionCode))
  AND userHasPermission(employeeId, permissionCode)
```

### Access scopes (permission + scope model)

Each row in `rbac_role_permissions` includes `accessScope`:

| Scope | Data visibility |
|-------|-----------------|
| `SELF` | Actor's own records |
| `TEAM` | Actor + direct reports (reporting-manager graph) |
| `DEPARTMENT` | All employees in actor's `departmentId` |
| `ORGANIZATION` | Full tenant roster |
| `GLOBAL` | Platform super-admin only |

**Effective scope** for a user with multiple roles uses **union semantics** (most permissive wins).

```
effectiveScope(user, permissionCode) = max(scope from each assigned role)
```

Data filtering uses `AccessScopeResolver` when `RBAC_SCOPE_V2=true`. When `RBAC_SCOPE_V2=false`, legacy role-code logic in `EmployeeScopeService` applies (`MANAGER` → team, `HR_ADMIN` → org, etc.).

**Rollback:** set `RBAC_SCOPE_V2=false` to revert to legacy scoping without data loss.

## Session API

`GET /auth/session` returns for tenant employees:

```json
{
  "user": { ... },
  "entitledModules": ["employees", "leave", ...],
  "permissions": ["employees:read", ...],
  "roles": ["HR_ADMIN"]
}
```

## Tenant RBAC API

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/rbac/roles` | `rbac:read` | List roles with counts and `isEditable`/`isDeletable` flags |
| POST | `/rbac/roles` | `rbac:manage` | Create custom role |
| GET | `/rbac/roles/:id` | `rbac:read` | Role detail with enriched permissions |
| PATCH | `/rbac/roles/:id` | `rbac:manage` | Update custom role name/description |
| PATCH | `/rbac/roles/:id/deactivate` | `rbac:manage` | Deactivate custom role (no active assignments) |
| POST | `/rbac/roles/:id/clone` | `rbac:manage` | Clone role with permissions |
| PATCH | `/rbac/roles/:id/permissions` | `rbac:manage` | Replace role permissions with optional `accessScope` per entry |
| GET | `/rbac/permissions` | `rbac:read` | List entitled permissions with matrix metadata |
| GET | `/rbac/employees/:id/roles` | `rbac:read` | Employee role assignments |
| PATCH | `/rbac/employees/:id/roles` | `rbac:manage` | Replace employee roles |
| GET | `/rbac/audit-logs` | `rbac:read` | Paginated audit log with actor names and summaries |

## Feature flags

- `RBAC_ENFORCED` — master switch (default `true` in production)
- `RBAC_SCOPE_V2` — permission + scope resolver (default `false`; set `true` to enable department-aware scoping)
- `RBAC_SETTINGS_ENFORCED` — settings route permissions
- `RBAC_EMPLOYEES_ENFORCED` — employees route permissions

When disabled, `PermissionsGuard` passes through; `RolesGuard` remains as fallback during migration.

## Permission catalog

Defined in `src/rbac/constants/permission-catalog.constant.ts`. Tenants cannot create custom permissions; they assign from this catalog within entitled modules.

## Data scoping

When `RBAC_SCOPE_V2=true`, row-level filters use `accessScope` on `rbac_role_permissions` (not role codes).

Legacy mode (`RBAC_SCOPE_V2=false`): users with `employees:read` and role `MANAGER` or `TEAM_LEAD` see direct reports; `ORG_ADMIN` / `HR_ADMIN` / `PAYROLL_ADMIN` see full roster.

### Design principles

- **Role** = access level only (generic: `MANAGER`, `HR_ADMIN`, etc.)
- **Department** = org structure on `employees.departmentId`; used by `DEPARTMENT` scope only
- **Designation** = position; not used in authorization
- **Reporting manager** = management graph; used by `TEAM` scope
- Avoid department-specific role names; assign department on the employee record instead
