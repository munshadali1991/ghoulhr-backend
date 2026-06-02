import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-employee leave balance tracking by policy and calendar year.
 */
export class EmployeeLeaveBalances1783000000000 implements MigrationInterface {
  name = 'EmployeeLeaveBalances1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_leave_balances" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "leaveConfigurationId" uuid NOT NULL,
        "year" smallint NOT NULL,
        "grantedDays" numeric(6,2) NOT NULL DEFAULT 0,
        "usedDays" numeric(6,2) NOT NULL DEFAULT 0,
        "pendingDays" numeric(6,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_employee_leave_balances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_emp_leave_balances_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_emp_leave_balances_leave_config"
          FOREIGN KEY ("leaveConfigurationId") REFERENCES "leave_configurations"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_emp_leave_balances_emp_config_year"
      ON "employee_leave_balances" ("employeeId", "leaveConfigurationId", "year")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emp_leave_balances_org_emp_year"
      ON "employee_leave_balances" ("organizationId", "employeeId", "year")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_emp_leave_balances_employeeId"
      ON "employee_leave_balances" ("employeeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emp_leave_balances_employeeId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emp_leave_balances_org_emp_year"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_emp_leave_balances_emp_config_year"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_leave_balances"`);
  }
}
