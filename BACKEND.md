# Backend Documentation

## 1. Overview

The GhoulHRMS backend is a **multi-tenant HR management system API** built with NestJS. It serves as the central authority for tenant isolation, user authentication, organization lifecycle management, and role-based access control. The system supports Super Admin operations for managing multiple organizations and Organization Admin operations for managing individual organization employees, attendance, and payroll. Each organization has its own subdomain-based tenant scope.

**Tech Stack:**
- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL with TypeORM
- **Authentication:** Custom HMAC-SHA256 JWT implementation
- **Password Hashing:** scrypt with salt
- **Validation:** class-validator + class-transformer
- **API Documentation:** Swagger/OpenAPI
- **Runtime:** Node.js 20+

**Role in System:** Provides RESTful API endpoints consumed by the frontend application ([See Frontend Integration](./FRONTEND.md#api-integration-layer)) and enforces tenant isolation through subdomain-based middleware. Supports role-based dashboards for SUPER_ADMIN and ORG_ADMIN users.

---

## 2. Project Structure

```
backend/ghoulhr-backend/
├── src/
│   ├── auth/                          # Authentication & authorization
│   │   ├── dto/                       # Data transfer objects
│   │   │   ├── auth-response.dto.ts   # Login/register response format
│   │   │   ├── bootstrap-super-admin.dto.ts
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   ├── guards/                    # Route protection
│   │   │   ├── auth-token.guard.ts    # JWT validation
│   │   │   ├── roles.guard.ts         # Role-based access
│   │   │   └── tenant-auth.guard.ts   # Tenant-scoped authentication
│   │   ├── auth.controller.ts         # Auth endpoints
│   │   ├── auth.service.ts            # Auth business logic
│   │   ├── auth.module.ts
│   │   ├── auth.types.ts              # TypeScript interfaces
│   │   └── super-admin-bootstrap.service.ts
│   ├── common/
│   │   ├── decorators/
│   │   │   └── roles.decorator.ts     # @Roles() metadata
│   │   └── middleware/
│   │       └── tenant-resolver.middleware.ts  # Subdomain → org mapping + DB connection
│   ├── core/
│   │   └── database/                  # Core database infrastructure
│   │       ├── database-core.module.ts
│   │       ├── migration-runner.service.ts    # Tenant migration management
│   │       └── tenant-connection.manager.ts   # Multi-tenant connection pool
│   ├── database/
│   │   ├── base.entity.ts             # Shared entity fields (id, timestamps)
│   │   ├── database.config.ts         # TypeORM configuration
│   │   └── database.module.ts
│   ├── employees/                     # Employee management (Tenant-scoped)
│   │   ├── employee.entity.ts         # Employee entity for tenant databases
│   │   ├── employees.controller.ts    # Employee CRUD endpoints
│   │   ├── employees.service.ts       # Employee business logic
│   │   └── employees.module.ts
│   ├── migrations/                    # Database migrations
│   │   ├── tenant/                    # Tenant-specific migrations
│   │   │   └── 1769000000001-create-employees-table.ts
│   │   ├── 1768936823119-create-organizations.ts
│   │   ├── 1768942400000-create-users.ts
│   │   ├── 1768949800000-expand-organizations-profile.ts
│   │   └── 1769000000000-add-tenant-db-fields-to-organizations.ts
│   ├── modules/                       # Shared utility modules
│   │   ├── email/                     # Email notification service
│   │   │   ├── email.service.ts       # Email sending logic
│   │   │   ├── email.module.ts        # Email module
│   │   │   └── index.ts               # Public exports
│   │   ├── cache/                     # Caching service
│   │   ├── sms/                       # SMS notification service
│   │   └── storage/                   # File storage service
│   ├── organizations/                 # Organization management
│   │   ├── dto/
│   │   │   ├── create-organization.dto.ts
│   │   │   └── update-organization.dto.ts
│   │   ├── organization-status.enum.ts
│   │   ├── organization.entity.ts     # DB schema (includes tenant DB fields)
│   │   ├── organizations.controller.ts
│   │   ├── organizations.service.ts
│   │   └── organizations.module.ts
│   ├── org-admin/                     # Organization Admin operations (Future)
│   │   ├── org-admin.controller.ts    # ORG_ADMIN endpoints
│   │   ├── org-admin.service.ts       # ORG_ADMIN business logic
│   │   └── org-admin.module.ts
│   ├── roles/
│   │   └── roles.enum.ts              # SUPER_ADMIN, ORG_ADMIN, MANAGER, EMPLOYEE
│   ├── users/
│   │   ├── user-status.enum.ts
│   │   ├── user.entity.ts
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── app.module.ts                  # Root module
│   ├── app.controller.ts
│   ├── app.service.ts
│   └── main.ts                        # Server entry point
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
└── typeorm.config.ts
```

---

## 3. Server Entry & Configuration

**Entry Point:** [main.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/main.ts)

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // ...
  await app.listen(3000);
}
```

**Middleware Setup:**
1. **CORS:** Allows `localhost`, `127.0.0.1`, `*.ghoulhr.com` origins with credentials
2. **ValidationPipe:** Global DTO validation with whitelist enforcement
3. **Swagger UI:** Available at `/api-docs` with JWT Bearer auth support
4. **TenantResolverMiddleware:** Applied globally to all routes (see [Tenant Resolution](#7-tenant-resolution))

**Environment Configuration:**
- Loads `.env` (development) or `.env.production` based on `NODE_ENV`
- Database config registered via `ConfigModule.forRoot({ load: [databaseConfig] })`
- [See all environment variables](#10-environment-variables)

---

## 4. Architecture

### Pattern: Controller → Service → Repository

The backend follows NestJS's layered architecture:

```
Request → Controller → Service → TypeORM Repository → PostgreSQL
                                                       ↓
Response ← Controller ← Service ← Entity Transformation
```

**Example Flow (Login):**
1. `AuthController.login()` receives POST `/auth/login`
2. Validates `LoginDto` via class-validator
3. Calls `AuthService.login()`
4. `TenantResolverMiddleware` has already attached `req.organization` from subdomain
5. `AuthService` calls `UsersService.findByEmailAndOrganization()` with tenant-scoped search
6. **Enhanced Login Logic:** If user not found in tenant org, searches globally across all organizations
7. **SUPER_ADMIN Priority:** If multiple users found with same email, prioritizes SUPER_ADMIN role
8. Verifies password with scrypt
9. Generates JWT token with HMAC-SHA256
10. Returns `{ accessToken, user }` with correct role

**Dependency Injection:**
- Services injected into controllers via constructors
- Repositories injected via `@InjectRepository(Entity)`
- ConfigService for environment variables

---

## 5. API Endpoints

**Used by frontend. See integration: [Frontend API Layer](./FRONTEND.md#api-integration-layer)**

### Auth Endpoints

| Method | Route | Description | Access | Frontend Usage |
|--------|-------|-------------|--------|----------------|
| POST | `/auth/register` | Register user in tenant org | Open (requires org context) | Not used in current frontend |
| POST | `/auth/login` | Tenant-scoped login with global fallback | Open | [See loginRequest](./FRONTEND.md#auth-api) |
| POST | `/auth/superadmin/bootstrap` | Create first SUPER_ADMIN | Requires `x-bootstrap-admin-key` header | [See bootstrapSuperAdminRequest](./FRONTEND.md#auth-api) |

**Login Enhancement:**
The login endpoint now supports cross-tenant SUPER_ADMIN access:
1. First attempts to find user in the tenant organization (from subdomain)
2. If not found, searches globally across all organizations
3. If multiple users exist with same email, prioritizes SUPER_ADMIN role
4. This allows SUPER_ADMIN to login from any subdomain while maintaining tenant isolation for ORG_ADMIN and other roles

### Organization Endpoints

All endpoints require `Bearer` token with `SUPER_ADMIN` role.

| Method | Route | Description | Frontend Usage |
|--------|-------|-------------|----------------|
| POST | `/organizations` | Create organization tenant | [createOrganization](./FRONTEND.md#organizations-api) |
| GET | `/organizations` | List all organizations | [listOrganizations](./FRONTEND.md#organizations-api) |
| GET | `/organizations/stats` | Dashboard statistics | [getSuperAdminDashboardStats](./FRONTEND.md#organizations-api) |
| GET | `/organizations/dashboard/stats` | Dashboard stats (alias) | - |
| GET | `/organizations/deleted` | List soft-deleted orgs | [listDeletedOrganizations](./FRONTEND.md#organizations-api) |
| PATCH | `/organizations/id/:id` | Update organization | [updateOrganization](./FRONTEND.md#organizations-api) |
| DELETE | `/organizations/id/:id` | Soft-delete organization | [deleteOrganization](./FRONTEND.md#organizations-api) |
| PATCH | `/organizations/id/:id/restore` | Restore deleted org | [restoreOrganization](./FRONTEND.md#organizations-api) |
| GET | `/organizations/:subdomain` | Find by subdomain | - |

### Organization Admin Endpoints (Future Implementation)

These endpoints will be used by the OrgAdminDashboard frontend. Currently defined in API service layer but not yet implemented in backend.

All endpoints require `Bearer` token with `ORG_ADMIN` role and are scoped to the user's organization.

| Method | Route | Description | Frontend Usage |
|--------|-------|-------------|----------------|
| GET | `/org-admin/dashboard/stats` | Organization dashboard metrics | [getOrgAdminDashboardStats](./FRONTEND.md#organization-admin-api) |
| GET | `/org-admin/employees` | List organization employees | [getOrganizationEmployees](./FRONTEND.md#organization-admin-api) |
| GET | `/org-admin/attendance` | Get attendance data | [getOrganizationAttendance](./FRONTEND.md#organization-admin-api) |
| GET | `/org-admin/payroll` | Get payroll information | [getOrganizationPayroll](./FRONTEND.md#organization-admin-api) |
| GET | `/org-admin/organization/:id` | Get organization details | [getOrganizationDetails](./FRONTEND.md#organization-admin-api) |

### Employee Endpoints (Tenant-Scoped)

All endpoints require `Bearer` token and are scoped to the current tenant's database.

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| GET | `/employees` | List all employees in current tenant | TenantAuthGuard |
| GET | `/employees/:id` | Get employee by ID | TenantAuthGuard |
| POST | `/employees` | Create new employee in tenant | TenantAuthGuard |

**Note:** Employee endpoints use `req.tenantDataSource` to query the organization's dedicated database.

### Request/Response Formats

**Login Request:**
```json
{
  "email": "admin@acme.com",
  "password": "Passw0rd!23"
}
```

**Auth Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "organizationId": "uuid",
    "organizationSubdomain": "acme",
    "email": "admin@acme.com",
    "role": "SUPER_ADMIN"
  }
}
```

**Bootstrap Request:**
```json
{
  "email": "superadmin@ghoulhr.com",
  "password": "SuperAdmin@123",
  "organizationName": "GhoulHRMS",
  "subdomain": "ghoulhr"
}
```

**Create Organization Request:**
```json
{
  "name": "Acme Corporation",
  "subdomain": "acme",
  "adminEmail": "admin@acme.com",
  "adminName": "John Doe"
}
```

**Organization Creation Behavior:**
When an organization is created with `adminEmail`:
1. Organization record is created in database
2. Default admin user is automatically created with:
   - Email: exact value from `adminEmail` field (no subdomain mapping)
   - Password: `admin@123` (static default password)
   - Role: `ORG_ADMIN`
3. Credentials email is sent to admin via EmailService
4. Admin can immediately login using subdomain + email + password

---

## 6. Database Layer

### Entity: Organization

**File:** [organization.entity.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/organizations/organization.entity.ts)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| name | string | Required | Organization name |
| subdomain | string | Unique, indexed | Tenant subdomain |
| status | enum | ACTIVE/INACTIVE | Account status |
| monthlySubscriptionAmount | numeric(12,2) | Default: 0 | Monthly billing |
| + 40+ optional fields | various | Nullable | Address, compliance, payroll, admin details |
| dbName | string | Nullable | Tenant database name |
| dbHost | string | Nullable | Tenant database host |
| dbUser | string | Nullable | Tenant database user |
| dbPassword | string | Nullable | Tenant database password |
| createdAt | timestamptz | Auto | Creation timestamp |
| updatedAt | timestamptz | Auto | Last update |
| deletedAt | timestamptz | Nullable | Soft delete timestamp |

**Tenant Database Fields:**
The `dbName`, `dbHost`, `dbUser`, and `dbPassword` fields enable isolated database-per-tenant architecture. When these fields are set, the TenantConnectionManager creates dedicated connections to each organization's database.

### Entity: User

**File:** [user.entity.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/users/user.entity.ts)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| organizationId | UUID | FK → Organization.id | Tenant scope |
| email | string | Unique per org | User email |
| password | string | Required | scrypt hash (salt:derived) |
| role | enum | SUPER_ADMIN/ORG_ADMIN/MANAGER/EMPLOYEE | Access level |
| status | enum | ACTIVE/INACTIVE | Account status |

**Relationships:**
- `User.organizationId` → `Organization.id` (Many-to-One, CASCADE DELETE)
- Unique constraint: `[email, organizationId]`

### Base Entity

All entities extend [BaseEntity](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/database/base.entity.ts):
- `id`: UUID primary key
- `createdAt`, `updatedAt`, `deletedAt`: Automatic timestamps
- Soft deletes via `deletedAt` column

---

## 6.5. Employees Module (Tenant-Scoped)

**Location:** `src/employees/`

The employees module manages employee records within individual tenant databases. This module is scoped to specific organizations and uses tenant-specific database connections.

### Employee Entity

**File:** [employee.entity.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/employees/employee.entity.ts)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| globalUserId | string | Indexed | Link to global user account |
| name | string | Required | Employee full name |
| email | string | Required, indexed | Employee email |
| role | enum | ADMIN/EMPLOYEE/MANAGER/HR, default: EMPLOYEE | Employee role |
| department | string | Nullable | Department name |
| designation | string | Nullable | Job title/designation |
| employeeId | string | Nullable | Employee ID code |
| phoneNumber | string | Nullable | Contact number |
| dateOfBirth | string | Nullable | Date of birth |
| dateOfJoining | string | Nullable | Joining date |
| address | string | Nullable | Employee address |
| emergencyContact | string | Nullable | Emergency contact |
| bloodGroup | string | Nullable | Blood group |
| bankName | string | Nullable | Bank name |
| accountNumber | string | Nullable | Bank account number |
| ifscCode | string | Nullable | Bank IFSC code |
| panNumber | string | Nullable | PAN card number |
| aadhaarNumber | string | Nullable | Aadhaar card number |
| uanNumber | string | Nullable | UAN (EPFO) number |
| esiNumber | string | Nullable | ESI number |
| pfNumber | string | Nullable | PF number |
| createdAt | timestamptz | Auto | Creation timestamp |
| updatedAt | timestamptz | Auto | Last update |
| deletedAt | timestamptz | Nullable | Soft delete timestamp |

### EmployeesService

**File:** [employees.service.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/employees/employees.service.ts)

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `create()` | Create new employee in tenant database | dto, dataSource |
| `findByEmail()` | Find employee by email | email, dataSource |
| `findByGlobalUserId()` | Find employee by global user ID | globalUserId, dataSource |
| `findAll()` | List all employees in tenant | dataSource |
| `findById()` | Find employee by ID | id, dataSource |

### EmployeesController

**File:** [employees.controller.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/employees/employees.controller.ts)

**Endpoints:**

| Method | Route | Description | Access |
|--------|-------|-------------|--------|
| GET | `/employees` | List all employees in current tenant | TenantAuthGuard |
| GET | `/employees/:id` | Get employee by ID | TenantAuthGuard |
| POST | `/employees` | Create new employee in tenant | TenantAuthGuard |

**Tenant Database Integration:**
- Uses `req.tenantDataSource` from tenant resolver middleware
- Operations are scoped to the current organization's database
- Supports multi-tenant architecture with separate tenant databases

### EmployeesModule

**File:** [employees.module.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/employees/employees.module.ts)

```typescript
import { Module, forwardRef } from '@nestjs/common';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
```

**Note:** Uses `forwardRef()` to resolve circular dependency with AuthModule.

---

## 6.6. Core Database Infrastructure

**Location:** `src/core/database/`

This module provides the infrastructure for multi-tenant database management, including connection pooling and migration execution.

### TenantConnectionManager

**File:** [tenant-connection.manager.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/core/database/tenant-connection.manager.ts)

Manages PostgreSQL connections for individual tenant databases with connection pooling and caching.

**Key Features:**
- Connection pooling with configurable pool size (default: 10)
- Thread-safe connection creation with locking mechanism
- Connection caching to avoid redundant initializations
- Automatic cleanup on module destruction

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `getOrCreateConnection()` | Get cached or create new tenant connection | Organization |
| `createDatabase()` | Create a new PostgreSQL database | dbName |
| `dropDatabase()` | Drop a tenant database (with connection cleanup) | dbName |
| `hasConnection()` | Check if connection exists | dbName |
| `getConnection()` | Get connection without creating | dbName |
| `onModuleDestroy()` | Clean up all connections | - |

**Configuration:**
- Uses organization-specific DB credentials (dbName, dbHost, dbUser, dbPassword)
- Falls back to environment variables if org-specific credentials not set
- Pool size configurable via `TENANT_CONNECTION_POOL_SIZE` env var
- Connection timeout: 10 seconds
- Entities loaded: `src/employees/*.entity{.ts,.js}`
- Migrations loaded: `src/migrations/tenant/*.js`

### MigrationRunnerService

**File:** [migration-runner.service.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/core/database/migration-runner.service.ts)

Manages database migrations for tenant databases.

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `runMigrations()` | Run all pending migrations | DataSource |
| `revertLastMigration()` | Revert last migration | DataSource |
| `showMigrationStatus()` | Show migration status | DataSource |

### DatabaseCoreModule

**File:** [database-core.module.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/core/database/database-core.module.ts)

```typescript
@Module({
  providers: [TenantConnectionManager, MigrationRunnerService],
  exports: [TenantConnectionManager, MigrationRunnerService],
})
export class DatabaseCoreModule {}
```

Exports both services for use across the application.

---

## 7. Email Service Module

**Location:** `src/modules/email/`

The email module provides centralized email notification services for the application.

### EmailService

**File:** [email.service.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/modules/email/email.service.ts)

**Methods:**

| Method | Description | Parameters |
|--------|-------------|------------|
| `sendAdminCredentials()` | Sends credentials when organization is created | to, organizationName, subdomain, email, password |
| `sendEmployeeCredentials()` | Sends credentials when employee is onboarded | to, organizationName, email, password |

**Current Implementation:**
- Logs email details (dummy implementation)
- Ready for integration with email providers (nodemailer, SendGrid, AWS SES, etc.)
- See TODO comments in source for integration examples

**Future Enhancement:**
When implementing real email sending, update the `EmailService` methods with your preferred email provider. The service is already integrated into the organization creation flow.

**Integration Example:**
```typescript
// In organizations.service.ts - already implemented
await this.emailService.sendAdminCredentials({
  to: dto.adminEmail,
  organizationName: savedOrganization.name,
  subdomain: savedOrganization.subdomain,
  email: dto.adminEmail,
  password: this.DEFAULT_ADMIN_PASSWORD,
});
```

---

## 7. Authentication & Authorization

**[See how frontend handles auth](./FRONTEND.md#authentication-flow)**

### JWT Implementation

**Custom HMAC-SHA256 Tokens** (not standard JWT library):

```typescript
// Token generation (auth.service.ts:247-252)
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
return `${header}.${body}.${signature}`;
```

**Token Payload:**
```typescript
interface AuthTokenPayload {
  sub: string;              // User ID
  organizationId: string;
  organizationSubdomain: string;
  role: Role;
  email: string;
  exp: number;              // Expiry (Unix timestamp)
}
```

**Token Validation Flow:**
1. Extract Bearer token from `Authorization` header
2. Split into header.payload.signature
3. Recompute signature with `JWT_SECRET`
4. Timing-safe comparison with `timingSafeEqual()`
5. Check expiry timestamp
6. Parse payload and attach to `req.user`

### Password Hashing

```typescript
// Hash format: "salt:derivedKey"
hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
```

### Guards

**AuthTokenGuard:**
- Validates Bearer token
- Attaches decoded payload to `req.user`
- Throws `UnauthorizedException` if invalid

**TenantAuthGuard:**
- Validates Bearer token and verifies tenant isolation
- Attaches decoded payload to `req.user`
- Validates that token's organization subdomain matches current request's tenant
- Throws `ForbiddenException` if subdomain mismatch
- Used by EmployeesController and other tenant-specific endpoints

**RolesGuard:**
- Reads `@Roles()` metadata from route
- Checks `req.user.role` against required roles
- Throws `ForbiddenException` if insufficient

**Usage Example:**
```typescript
@UseGuards(AuthTokenGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('organizations')
export class OrganizationsController { ... }

@UseGuards(TenantAuthGuard)
@Controller('employees')
export class EmployeesController { ... }
```

### Bootstrap Super Admin Flow

1. Frontend sends POST `/auth/superadmin/bootstrap` with `x-bootstrap-admin-key` header
2. Backend validates key against `BOOTSTRAP_ADMIN_KEY` env var
3. Checks if any SUPER_ADMIN exists (prevents duplicate)
4. Creates default organization if subdomain doesn't exist
5. Creates SUPER_ADMIN user
6. Returns auth response

**Security Note:** Bootstrap key must be kept secret; used only for initial setup.

---

## 8. Tenant Resolution

**Middleware:** [tenant-resolver.middleware.ts](file:///d:/Web%20dev/ghoulhr/backend/ghoulhr-backend/src/common/middleware/tenant-resolver.middleware.ts)

**Applied globally to all routes**

**Flow:**
1. Extract `req.headers.host` (e.g., `amazon.ghoulhr.com`)
2. If host is `ghoulhr.com`, `localhost:3000`, or `localhost`, skip tenant resolution
3. Parse subdomain from host (`amazon`)
4. Query `organizations` table for matching subdomain
5. Attach organization to `req.organization`
6. Get or create tenant database connection via `TenantConnectionManager`
7. Attach `req.tenantDataSource` for tenant-scoped database operations
8. Reject if organization not found or status != ACTIVE

**Excluded Paths:**
- `/api/auth` - Authentication endpoints
- `/api/super-admin` - Super admin endpoints
- `/api-docs` - Swagger documentation
- `/health` - Health check endpoint

**Impact on Auth:**
- Login first searches users within `req.organization.id` (tenant-scoped)
- **Enhanced:** If user not found in tenant org, searches globally (for SUPER_ADMIN access)
- **Role Priority:** When multiple users found with same email, SUPER_ADMIN role is prioritized
- Registration validates `organizationId` matches tenant
- Prevents cross-tenant data access for ORG_ADMIN and other roles
- SUPER_ADMIN can access from any subdomain due to global user search fallback

**Tenant Database Connection:**
- Each organization has dedicated PostgreSQL database (configured via `dbName`, `dbHost`, `dbUser`, `dbPassword`)
- Connections are pooled and cached for performance
- Thread-safe connection creation prevents race conditions
- Connection pool size configurable via `TENANT_CONNECTION_POOL_SIZE` environment variable

**Request Interface:**
```typescript
export interface TenantRequest extends Request {
  organization?: any;              // Resolved organization
  tenantDataSource?: DataSource;   // Tenant-specific database connection
  user?: any;                      // Authenticated user
}
```

---

## 9. Error Handling

### Validation Errors
- **400 Bad Request:** Invalid DTO (auto-handled by ValidationPipe)
- Response format: `{ "message": ["email must be an email"], "error": "Bad Request", "statusCode": 400 }`

### Business Logic Errors
- **401 Unauthorized:** Invalid credentials, missing/expired token
- **403 Forbidden:** Inactive user, wrong role, invalid bootstrap key
- **404 Not Found:** Organization/user not found
- **409 Conflict:** Duplicate email, subdomain already exists

### Global Error Response Format
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

---

## 10. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | - | PostgreSQL host |
| `DB_PORT` | Yes | - | PostgreSQL port |
| `DB_USER` | Yes | - | Database username |
| `DB_PASS` | Yes | - | Database password |
| `DB_NAME` | Yes | - | Database name |
| `DB_LOGGING` | No | `false` | Enable SQL logging |
| `JWT_SECRET` or `AUTH_TOKEN_SECRET` | Yes | - | HMAC signing key |
| `JWT_EXPIRES_IN` | No | `8h` | Token TTL (e.g., `8h`, `30m`, `1d`) |
| `BOOTSTRAP_ADMIN_KEY` | Yes | - | Secret key for SUPER_ADMIN bootstrap |
| `DEFAULT_SUPERADMIN_EMAIL` | No | `ghoulsuper@ghoulhr.com` | Auto-created admin email |
| `DEFAULT_SUPERADMIN_PASSWORD` | No | `Ghoul@123#` | Auto-created admin password |
| `DEFAULT_ORGANIZATION_NAME` | No | `GhoulHRMS` | Default org name |
| `DEFAULT_ORGANIZATION_SUBDOMAIN` | No | `ghoulhr` | Default org subdomain |
| `TENANT_CONNECTION_POOL_SIZE` | No | `10` | Connection pool size per tenant |

---

## 11. Run & Setup

### Prerequisites
- Node.js ≥ 20.0.0
- npm ≥ 10.0.0
- PostgreSQL database

### Installation
```bash
cd backend/ghoulhr-backend
npm install
```

### Environment Setup
```bash
# Copy and configure
cp .env.development .env
# Edit .env with your database credentials and secrets
```

### Database Migrations
```bash
# Run pending migrations
npx typeorm migration:run -d typeorm.config.ts
```

### Development
```bash
npm run start:dev        # Watch mode
npm run start:debug      # Debug mode
```

### Production
```bash
npm run build            # Compile to dist/
npm run start:prod       # Run from dist/main
```

### Swagger Documentation
Access at: `http://localhost:3000/api-docs`

### Testing
```bash
npm run test             # Unit tests
npm run test:e2e         # E2E tests
npm run test:cov         # Coverage report
```

---

## 12. Observations & Improvements

### ✅ Strengths
1. **Strong Tenant Isolation:** Subdomain-based middleware ensures data separation
2. **Secure Password Hashing:** scrypt with random salt and timing-safe comparison
3. **Comprehensive Validation:** DTOs with class-validator decorators
4. **Soft Deletes:** Organizations can be restored via recycle bin
5. **Role-Based Access:** Decorator-based guard system is clean and extensible
6. **Swagger Integration:** Auto-generated API documentation
7. **Automated Admin Provisioning:** Organizations automatically create admin users with credential delivery
8. **Modular Architecture:** Shared utility modules (email, sms, cache, storage) in `/modules` directory
9. **Future-Ready Email Integration:** EmailService centralized and ready for provider integration
10. **Enhanced Login Flow:** SUPER_ADMIN can login from any subdomain with global user search and role priority
11. **Cross-Tenant SUPER_ADMIN Access:** Intelligent login resolution maintains tenant isolation while allowing super admin flexibility
12. **Database-Per-Tenant Architecture:** Each organization has isolated PostgreSQL database with dedicated connection pooling
13. **Tenant Connection Management:** Thread-safe connection creation with caching and configurable pool sizes
14. **Tenant Migration System:** Dedicated migration runner for tenant-specific database schemas
15. **Comprehensive Employee Management:** Full CRUD operations for employees with tenant database isolation
16. **Circular Dependency Resolution:** Proper use of `forwardRef()` for complex module interdependencies

### ⚠️ Security Concerns
1. **Custom JWT Implementation:** Not using industry-standard `@nestjs/jwt` library; potential for subtle vulnerabilities
2. **No Rate Limiting:** Login endpoint vulnerable to brute force attacks
3. **No Refresh Tokens:** Users must re-authenticate when access token expires
4. **Bootstrap Key in Frontend:** `VITE_BOOTSTRAP_ADMIN_KEY` exposed in client-side code ([See frontend env](./FRONTEND.md#environment-variables))
5. **CORS Wildcard for Localhost:** Allows any localhost origin in development

### 🚀 Scalability Suggestions
1. **Add Redis Caching:** Cache organization lookups in tenant middleware
2. **Database Indexing:** Add indexes on frequently queried fields (email, subdomain)
3. **Pagination:** Organizations list endpoint returns all records; implement pagination
4. **API Versioning:** Add `/api/v1/` prefix for future compatibility
5. **Separate Auth Module:** Move JWT logic to dedicated `@nestjs/jwt` + `@nestjs/passport`
6. **Audit Logging:** Track organization CRUD operations for compliance
7. **Health Checks:** Add `/health` endpoint for monitoring
8. **Email Provider Integration:** Implement real email sending in EmailService (SendGrid, AWS SES, etc.)
9. **Configurable Admin Password:** Make default admin password configurable via environment variables
10. **Employee Onboarding Automation:** Extend email service for employee credential delivery
11. **Implement ORG_ADMIN Endpoints:** Build `/org-admin/*` endpoints for employees, attendance, payroll management
12. **Role-Based API Gateway:** Separate SUPER_ADMIN and ORG_ADMIN endpoint routing
13. **Automated Tenant Provisioning:** Auto-create tenant database and run migrations on organization creation
14. **Connection Pool Monitoring:** Add metrics for tenant database connection pool usage
15. **Tenant Database Backup:** Implement automated backup system for tenant databases

### 🐛 Potential Bugs
1. **Token Expiry Parsing:** `parseTtlToSeconds()` may fail on edge cases like `0s` or negative values
2. **Default Super Admin Auto-Creation:** `ensureDefaultSuperAdmin()` is defined but not called in `main.ts`
3. **Missing Users Controller:** No API endpoints to manage users (only organizations)
4. **No Email Verification:** Users can register without confirming email ownership
5. **Static Admin Password:** Default password `admin@123` should be rotated or made configurable
6. **~~Cross-Tenant Login Conflicts:~~** ~~SUPER_ADMIN login may return wrong role if same email exists in multiple orgs~~ **FIXED:** Login logic now prioritizes SUPER_ADMIN role when multiple users found

### 📝 Code Quality
- **Excellent:** Consistent TypeScript usage, proper DTOs, separation of concerns
- **Good:** Swagger decorators on all endpoints, meaningful error messages
- **Needs Work:** No unit tests visible, hardcoded strings in some places, no logging in controllers
- **Improved:** Centralized email service in modules directory for scalability
- **Enhanced:** Login flow improved with role-based priority and cross-tenant SUPER_ADMIN support
- **Resolved:** Circular dependency between AuthModule, OrganizationsModule, and EmployeesModule using `forwardRef()`
- **Added:** Tenant-scoped employee management with dedicated database connections
- **Added:** Core database infrastructure with connection pooling and migration management
- **Added:** TenantResolverMiddleware now provides both organization context and database connections
