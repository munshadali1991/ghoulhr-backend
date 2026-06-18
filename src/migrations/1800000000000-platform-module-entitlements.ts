import { MigrationInterface, QueryRunner } from 'typeorm';

const PLATFORM_MODULES = [
  { code: 'employees', name: 'Employees', description: 'Employee records and HR onboarding', sortOrder: 1 },
  { code: 'settings', name: 'Organization Settings', description: 'Org profile and configuration', sortOrder: 2 },
  { code: 'leave', name: 'Leave Management', description: 'Leave policies and ESS leave', sortOrder: 3 },
  { code: 'attendance', name: 'Attendance', description: 'Attendance tracking and policies', sortOrder: 4 },
  { code: 'timesheet', name: 'Timesheet', description: 'Timesheet entry and configuration', sortOrder: 5 },
  { code: 'payroll', name: 'Payroll', description: 'Payroll processing', sortOrder: 6 },
  { code: 'tracking', name: 'Tracking', description: 'Employee tracking module', sortOrder: 7 },
  { code: 'approvals', name: 'Approvals', description: 'Leave and timesheet approvals', sortOrder: 8 },
  { code: 'rbac', name: 'Roles & Permissions', description: 'Tenant RBAC administration', sortOrder: 9 },
];

export class PlatformModuleEntitlements1800000000000
  implements MigrationInterface
{
  name = 'PlatformModuleEntitlements1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_modules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_platform_modules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_modules_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_module_entitlements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "moduleCode" character varying NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "enabledAt" TIMESTAMPTZ,
        "enabledBy" uuid,
        "expiresAt" TIMESTAMPTZ,
        CONSTRAINT "PK_organization_module_entitlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_org_module_entitlement" UNIQUE ("organizationId", "moduleCode"),
        CONSTRAINT "FK_org_module_entitlement_org" FOREIGN KEY ("organizationId")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_org_module_entitlement_org" ON "organization_module_entitlements" ("organizationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_org_module_entitlement_module" ON "organization_module_entitlements" ("moduleCode")`,
    );

    for (const mod of PLATFORM_MODULES) {
      await queryRunner.query(
        `INSERT INTO "platform_modules" ("code", "name", "description", "sortOrder")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("code") DO NOTHING`,
        [mod.code, mod.name, mod.description, mod.sortOrder],
      );
    }

    const orgs: { id: string }[] = await queryRunner.query(
      `SELECT "id" FROM "organizations" WHERE "deletedAt" IS NULL`,
    );

    for (const org of orgs) {
      for (const mod of PLATFORM_MODULES) {
        await queryRunner.query(
          `INSERT INTO "organization_module_entitlements" ("organizationId", "moduleCode", "enabled", "enabledAt")
           VALUES ($1, $2, true, now())
           ON CONFLICT ("organizationId", "moduleCode") DO NOTHING`,
          [org.id, mod.code],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_module_entitlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_modules"`);
  }
}
