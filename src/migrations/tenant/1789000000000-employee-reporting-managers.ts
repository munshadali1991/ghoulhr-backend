import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeReportingManagers1789000000000
  implements MigrationInterface
{
  name = 'EmployeeReportingManagers1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_reporting_managers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "managerEmployeeId" uuid NOT NULL,
        "managerType" character varying NOT NULL DEFAULT 'PRIMARY',
        "effectiveFrom" date,
        "effectiveTo" date,
        CONSTRAINT "PK_employee_reporting_managers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_erm_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_erm_manager"
          FOREIGN KEY ("managerEmployeeId") REFERENCES "employees"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_erm_not_self" CHECK ("employeeId" <> "managerEmployeeId")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_erm_active_primary"
      ON "employee_reporting_managers" ("employeeId")
      WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL AND "managerType" = 'PRIMARY'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_erm_manager"
      ON "employee_reporting_managers" ("managerEmployeeId")
      WHERE "effectiveTo" IS NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "employee_reporting_managers"
        ("employeeId", "managerEmployeeId", "managerType", "effectiveFrom")
      SELECT
        ed."employeeId",
        ed."reportingManagerId",
        'PRIMARY',
        e."dateOfJoining"
      FROM "employee_employment_details" ed
      JOIN "employees" e ON e."id" = ed."employeeId"
      WHERE ed."reportingManagerId" IS NOT NULL
        AND ed."reportingManagerId" <> ed."employeeId"
        AND NOT EXISTS (
          SELECT 1 FROM "employee_reporting_managers" erm
          WHERE erm."employeeId" = ed."employeeId"
            AND erm."effectiveTo" IS NULL
            AND erm."deletedAt" IS NULL
            AND erm."managerType" = 'PRIMARY'
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_employment_details"
      DROP COLUMN IF EXISTS "reportingManagerId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_employment_details"
      ADD COLUMN IF NOT EXISTS "reportingManagerId" uuid
    `);

    await queryRunner.query(`
      UPDATE "employee_employment_details" ed
      SET "reportingManagerId" = sub."managerEmployeeId"
      FROM (
        SELECT DISTINCT ON ("employeeId")
          "employeeId",
          "managerEmployeeId"
        FROM "employee_reporting_managers"
        WHERE "effectiveTo" IS NULL
          AND "deletedAt" IS NULL
          AND "managerType" = 'PRIMARY'
        ORDER BY "employeeId", "createdAt" DESC
      ) sub
      WHERE ed."employeeId" = sub."employeeId"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_erm_manager"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_erm_active_primary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_reporting_managers"`);
  }
}
