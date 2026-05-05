# Backend Documentation

## Overview

The backend is a NestJS 11 multi-tenant HR API with:
- master-level organization and global user management
- tenant-scoped employee + settings modules
- cookie-based authentication with rotating refresh sessions
- organization runtime bootstrap (tenant DB setup + migrations)

## Stack

- NestJS 11 + TypeScript
- TypeORM + PostgreSQL
- class-validator + class-transformer
- Swagger (`/api-docs`)
- cookie-parser (HttpOnly auth cookies)

## Runtime Entry

Primary entry: `src/main.ts`

Current runtime behavior:
- loads cookies via `cookie-parser`
- enables JSON/urlencoded body limits (default `100mb`, env: `JSON_BODY_LIMIT`)
- enables CORS with:
  - explicit allowlist from `WEB_APP_ORIGINS` (comma-separated), or
  - localhost / subdomain localhost fallback checks
- applies global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- serves Swagger at `/api-docs`

App root wiring: `src/app.module.ts`
- imports:
  - `DatabaseModule`
  - `DatabaseCoreModule`
  - `AuthModule`
  - `UsersModule`
  - `OrganizationsModule`
  - `EmployeesModule`
  - `SettingsModule`
- applies `TenantResolverMiddleware` globally

## Authentication (Current)

### Model

The backend now uses **HttpOnly cookies** for auth in production app flows:
- access cookie (default `ghoulhr_access`)
- refresh cookie (default `ghoulhr_refresh`)

Bearer tokens are still accepted as a tooling fallback in guards and session lookup.

### Token + Session Components

- `src/auth/auth.service.ts`
  - custom HS256 token mint/verify (`createHmac`)
  - access token TTL from `JWT_ACCESS_EXPIRES_IN` or `JWT_EXPIRES_IN`
- `src/auth/auth-cookie.service.ts`
  - attaches/clears auth cookies
  - cookie behavior configurable via:
    - `COOKIE_SECURE`
    - `COOKIE_SAMESITE`
    - cookie-name envs
- `src/auth/entities/refresh-session.entity.ts`
  - persistent refresh session table (`refresh_sessions`)
  - supports session kinds: `master` and `employee`
- `src/auth/refresh-session.service.ts`
  - issue / validate / rotate / revoke refresh sessions
- `src/auth/auth-refresh.service.ts`
  - `/auth/refresh` and `/auth/logout` logic

### Auth Endpoints

From `src/auth/auth.controller.ts`:
- `GET /auth/session` -> resolves current user from access token
- `POST /auth/refresh` -> rotates refresh session + reissues access cookie
- `POST /auth/logout` -> revokes refresh + clears cookies
- `POST /auth/register` -> register in master users table
- `POST /auth/login` -> login via master users flow
- `POST /auth/superadmin/bootstrap` -> initial super-admin bootstrap

From `src/auth/tenant-auth.controller.ts`:
- `POST /auth/employee/login` -> employee login (tenant-aware)
- `POST /auth/change-password` -> password change (guarded)

### Guards

- `AuthTokenGuard` (`src/auth/guards/auth-token.guard.ts`)
  - reads access token from cookie or Bearer
  - validates and sets `req.user`
- `TenantAuthGuard` (`src/auth/guards/tenant-auth.guard.ts`)
  - same token read/validate
  - additionally enforces token subdomain == resolved tenant subdomain (when tenant context exists)
- `RolesGuard` (`src/auth/guards/roles.guard.ts`)
  - supports both platform `Role` and tenant `EmployeeRole`

## Tenant Resolution

Middleware: `src/common/middleware/tenant-resolver.middleware.ts`

Applied globally and skipped for excluded paths:
- `/auth`
- `/api/auth`
- `/api/super-admin`
- `/api-docs`
- `/health`

Resolution flow:
1. if `TENANT_LOCK_SUBDOMAIN` is set, force that tenant
2. otherwise parse host/port
3. if request port maps to `organization.orgPort`, bind that tenant
4. otherwise parse subdomain and resolve organization by subdomain
5. attach:
   - `req.organization`
   - `req.tenantDataSource` from `TenantConnectionManager`

The middleware rejects:
- unknown tenant
- non-active tenant
- tenant database not available

## Organizations Module

Key files:
- `src/organizations/organizations.controller.ts`
- `src/organizations/organizations.service.ts`
- `src/organizations/organization-runtime-bootstrap.service.ts`

### Controller routes (SUPER_ADMIN guarded)

- `POST /organizations`
- `GET /organizations`
- `GET /organizations/dashboard/stats`
- `GET /organizations/stats` (alias)
- `GET /organizations/deleted`
- `PATCH /organizations/id/:id`
- `DELETE /organizations/id/:id`
- `PATCH /organizations/id/:id/restore`
- `GET /organizations/id/:id`
- `GET /organizations/:subdomain`

### Service behavior highlights

- creates tenant runtime metadata on org create:
  - `dbName`, `dbHost`, `dbUser`, `dbPassword`, `orgPort`
- provisions tenant DB + runs tenant migrations
- rollback on failures:
  - drops created tenant DB
  - deletes master organization record
- auto-provisions ORG_ADMIN user path when `adminEmail` exists
- computes super admin dashboard aggregates (`totalOrganizations`, `totalUsers`, `totalRevenue`, growth)
- startup bootstrap (`OrganizationRuntimeBootstrapService`) runs:
  - `ensureAllOrganizationsRuntimeReady()`

## Employees Module

Key files:
- `src/employees/employees.controller.ts`
- `src/employees/employees.service.ts`
- `src/employees/dto/employee-onboarding.dto.ts`

### Controller routes

All under `TenantAuthGuard + RolesGuard`:
- `GET /employees` (ORG_ADMIN, MANAGER)
- `GET /employees/:id` (ORG_ADMIN, MANAGER)
- `POST /employees` (ORG_ADMIN)
- `POST /employees/:id/reset-password` (ORG_ADMIN)
- `POST /employees/check-duplicate` (ORG_ADMIN)
- `POST /employees/hr-onboarding` (ORG_ADMIN)

### Current service capabilities

- classic employee create with settings-aware validation
- enterprise HR onboarding transaction:
  - creates main employee row + related entities
  - supports encrypted sensitive fields
  - stores docs payload encrypted (`inline_base64` driver)
  - writes audit row
- duplicate checks for email and mobile
- password reset / login attempt tracking / lockout logic hooks
- employee code generation from settings:
  - `employee.id_prefix`
  - `employee.auto_generate_id`

## Settings Module

Key files:
- `src/settings/settings.controller.ts`
- `src/settings/settings.service.ts`
- `src/settings/settings.constants.ts`

### Controller routes

- `GET /settings/profile`
- `POST /settings/profile`
- `GET /settings/employee`
- `POST /settings/employee`
- `GET /settings/attendance`
- `POST /settings/attendance`
- `GET /settings`
- `GET /settings/:key`
- `POST /settings`

Important: specific routes are intentionally defined before `:key`.

### Data model

Settings use key-value JSON (`organization_settings` entity) and map between:
- internal keys (e.g. `org.date_format`, `attendance.shifts`)
- frontend-friendly object shapes (e.g. `dateFormat`, `working_days`)

## Core Database Infrastructure

`src/core/database/*`

- `TenantConnectionManager`
  - tenant datasource creation/caching
  - create/drop tenant DB helpers
- `MigrationRunnerService`
  - executes tenant migrations against datasource
- `DatabaseCoreModule`
  - exports both services

## Security-Relevant Notes

- Auth is cookie-first; access token may still be read from Bearer for tooling.
- Refresh sessions are persisted and rotated.
- Tenant isolation is enforced by:
  - middleware tenant binding
  - tenant guard subdomain checks
- Sensitive onboarding fields can be encrypted at rest through `FieldEncryptionService`.
- Bootstrap flow still relies on `BOOTSTRAP_ADMIN_KEY`.

## Environment Variables (Active/Important)

- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_LOGGING`
- Auth:
  - `JWT_SECRET` (or fallback `AUTH_TOKEN_SECRET`)
  - `JWT_ACCESS_EXPIRES_IN` / `JWT_EXPIRES_IN`
  - `JWT_REFRESH_EXPIRES_IN`
  - `AUTH_ACCESS_COOKIE_NAME`
  - `AUTH_REFRESH_COOKIE_NAME`
  - `COOKIE_SECURE`
  - `COOKIE_SAMESITE`
- Bootstrap:
  - `BOOTSTRAP_ADMIN_KEY`
  - defaults for initial org/super-admin identity
- Tenant/runtime:
  - `TENANT_CONNECTION_POOL_SIZE`
  - `TENANT_LOCK_SUBDOMAIN`
  - `ORG_PORT_START`
  - `API_SUBDOMAIN`
- Platform/CORS:
  - `WEB_APP_ORIGINS`
  - `TRUST_PROXY`
  - `JSON_BODY_LIMIT`
  - `FIELD_ENCRYPTION_KEY`

## Scripts

From `backend/ghoulhr-backend/package.json`:
- `npm run start:dev`
- `npm run build`
- `npm run start:prod`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run proxy:start`
- `npm run tenant:migrate`

## Current-State Notes

- `org-admin` dedicated backend module is not the main active path for current frontend behavior; org admin capabilities currently run mostly through employee/settings flows.
- Swagger bearer auth is documented as optional for tooling; production web app path uses cookies.
- `AuthService.ensureDefaultSuperAdmin()` exists but startup logic currently relies on explicit bootstrap/runtime flows rather than automatically calling this from `main.ts`.
