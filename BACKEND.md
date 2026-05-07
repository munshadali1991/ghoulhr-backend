# Backend Documentation

## Overview

The backend is a NestJS 11 multi-tenant HR API with:
- master-level organization and user management
- tenant-scoped employee and settings modules
- cookie-first authentication with rotating refresh sessions
- runtime tenant bootstrap (tenant DB provisioning + migrations)

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
  - localhost / subdomain-localhost fallback checks
- applies global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`)
- serves Swagger at `/api-docs`
- conditionally enables trust proxy via `TRUST_PROXY` or production `NODE_ENV`

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

## Authentication

### Model

The backend uses HttpOnly cookies for auth flows:
- access cookie (default `ghoulhr_access`)
- refresh cookie (default `ghoulhr_refresh`)

Bearer tokens are also accepted as a tooling fallback in guards.

### Token + Session Components

- `src/auth/auth.service.ts`
  - custom HS256 token mint/verify (`createHmac`)
  - access token TTL from `JWT_ACCESS_EXPIRES_IN` or `JWT_EXPIRES_IN`
  - tenant-aware register/login resolution
- `src/auth/auth-cookie.service.ts`
  - attaches/clears auth cookies
  - cookie behavior configurable via:
    - `COOKIE_SECURE`
    - `COOKIE_SAMESITE`
    - cookie-name envs
- `src/auth/entities/refresh-session.entity.ts`
  - persistent refresh session table (`refresh_sessions`)
  - session kinds include `master` and `employee`
- `src/auth/refresh-session.service.ts`
  - issue / validate / rotate / revoke refresh sessions
- `src/auth/auth-refresh.service.ts`
  - `/auth/refresh` and `/auth/logout` logic
- `src/auth/super-admin-bootstrap.service.ts`
  - auto-calls `ensureDefaultSuperAdmin()` during application bootstrap

### Auth Endpoints

From `src/auth/auth.controller.ts`:
- `GET /auth/session` -> resolves current user from access token
- `POST /auth/refresh` -> rotates refresh session + reissues access cookie
- `POST /auth/logout` -> revokes refresh + clears cookies
- `POST /auth/register` -> tenant-aware register into users table
- `POST /auth/login` -> login (tenant-first lookup with super-admin fallback)
- `POST /auth/superadmin/bootstrap` -> bootstrap super-admin using bootstrap key

From `src/auth/tenant-auth.controller.ts`:
- `POST /auth/employee/login` -> employee login (tenant-aware)
- `POST /auth/change-password` -> password change (guarded)

### Guards

- `AuthTokenGuard` (`src/auth/guards/auth-token.guard.ts`)
  - reads access token from cookie or Bearer
  - validates and sets `req.user`
- `TenantAuthGuard` (`src/auth/guards/tenant-auth.guard.ts`)
  - token validation + tenant-subdomain consistency checks
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
5. skip root domain / localhost root and skip `API_SUBDOMAIN`
6. attach:
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
- computes super-admin dashboard aggregates
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
- password reset / login attempt tracking / lockout hooks
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

Important: specific routes are defined before `:key`.

### Data model

Settings use key-value JSON (`organization_settings`) and map between:
- internal keys (for example `org.date_format`, `attendance.shifts`)
- frontend-friendly object shapes (for example `dateFormat`, `working_days`)

## Core Database Infrastructure

`src/database/*` and `src/core/database/*`

- `DatabaseModule`
  - master TypeORM setup (`migrationsRun: true`)
- `TenantConnectionManager`
  - tenant datasource creation/caching
  - create/drop tenant DB helpers
- `MigrationRunnerService`
  - executes tenant migrations against datasource
- `DatabaseCoreModule`
  - exports tenant connection + migration services

## Security-Relevant Notes

- Auth is cookie-first; access token may still be read from Bearer for tooling.
- Refresh sessions are persisted and rotated.
- Tenant isolation is enforced by middleware tenant binding and tenant-aware guards.
- Sensitive onboarding fields can be encrypted at rest via `FieldEncryptionService`.
- Super-admin bootstrap remains protected by `BOOTSTRAP_ADMIN_KEY` on bootstrap endpoint.

## Environment Variables (Active/Important)

- DB: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_LOGGING`
- Server/platform: `PORT`, `NODE_ENV`, `TRUST_PROXY`, `JSON_BODY_LIMIT`, `WEB_APP_ORIGINS`
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
  - `DEFAULT_SUPERADMIN_EMAIL`
  - `DEFAULT_SUPERADMIN_PASSWORD`
  - `DEFAULT_ORGANIZATION_NAME`
  - `DEFAULT_ORGANIZATION_SUBDOMAIN`
- Tenant/runtime:
  - `TENANT_CONNECTION_POOL_SIZE`
  - `TENANT_LOCK_SUBDOMAIN`
  - `ORG_PORT_START`
  - `API_SUBDOMAIN`
- Security:
  - `FIELD_ENCRYPTION_KEY`

## Scripts

From `backend/ghoulhr-backend/package.json`:
- `npm run build`
- `npm run format`
- `npm run start`
- `npm run start:dev`
- `npm run start:debug`
- `npm run start:prod`
- `npm run lint`
- `npm run test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:debug`
- `npm run test:e2e`
- `npm run proxy:start`
- `npm run pm2:start:base`
- `npm run pm2:sync:orgs`
- `npm run pm2:save`
- `npm run tenant:migrate`

## Current-State Notes

- Swagger bearer auth is documented as optional for tooling; production app flows use cookies.
- `AuthService.ensureDefaultSuperAdmin()` is auto-invoked during app bootstrap through `SuperAdminBootstrapService`.
- Current health check endpoint is `GET /` (`AppController`); `/health` is currently only in tenant-middleware excluded paths.
