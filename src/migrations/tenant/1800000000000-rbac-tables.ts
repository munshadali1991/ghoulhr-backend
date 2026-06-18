import { MigrationInterface, QueryRunner } from 'typeorm';

export class RbacTables1800000000000 implements MigrationInterface {
  name = 'RbacTables1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "isSystem" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_rbac_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rbac_roles_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "code" character varying NOT NULL,
        "moduleCode" character varying NOT NULL,
        "action" character varying NOT NULL,
        "description" text,
        CONSTRAINT "PK_rbac_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rbac_permissions_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_role_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "roleId" uuid NOT NULL,
        "permissionId" uuid NOT NULL,
        CONSTRAINT "PK_rbac_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_rbac_role_permission" UNIQUE ("roleId", "permissionId"),
        CONSTRAINT "FK_rbac_role_permissions_role" FOREIGN KEY ("roleId")
          REFERENCES "rbac_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rbac_role_permissions_permission" FOREIGN KEY ("permissionId")
          REFERENCES "rbac_permissions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_employee_role_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "roleId" uuid NOT NULL,
        "effectiveFrom" date,
        "effectiveTo" date,
        "assignedBy" uuid,
        "isPrimary" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_rbac_employee_role_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rbac_era_employee" FOREIGN KEY ("employeeId")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rbac_era_role" FOREIGN KEY ("roleId")
          REFERENCES "rbac_roles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rbac_permission_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "action" character varying NOT NULL,
        "actorEmployeeId" uuid,
        "targetType" character varying,
        "targetId" uuid,
        "before" jsonb,
        "after" jsonb,
        CONSTRAINT "PK_rbac_permission_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rbac_permissions_module" ON "rbac_permissions" ("moduleCode")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rbac_era_employee" ON "rbac_employee_role_assignments" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rbac_era_role" ON "rbac_employee_role_assignments" ("roleId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_permission_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_employee_role_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_roles"`);
  }
}
