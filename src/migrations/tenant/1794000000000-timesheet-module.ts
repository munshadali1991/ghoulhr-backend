import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee daily timesheets and line-item entries (ESS).
 */
export class TimesheetModule1794000000000 implements MigrationInterface {
  name = 'TimesheetModule1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timesheet_days" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "workDate" date NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'DRAFT',
        "totalHours" numeric(6,2) NOT NULL DEFAULT 0,
        "submittedAt" TIMESTAMPTZ,
        "approvedAt" TIMESTAMPTZ,
        "rejectedAt" TIMESTAMPTZ,
        "rejectionReason" text,
        "approverEmployeeId" uuid,
        CONSTRAINT "PK_timesheet_days" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_timesheet_days_org_emp_date"
          UNIQUE ("organizationId", "employeeId", "workDate"),
        CONSTRAINT "FK_timesheet_days_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_timesheet_days_approver"
          FOREIGN KEY ("approverEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheet_days_org_emp_date_status"
      ON "timesheet_days" ("organizationId", "employeeId", "workDate", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timesheet_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "timesheetDayId" uuid NOT NULL,
        "projectName" character varying(120) NOT NULL,
        "taskName" character varying(200) NOT NULL,
        "taskDescription" text NOT NULL,
        "workType" character varying(32) NOT NULL,
        "hoursSpent" numeric(5,2) NOT NULL,
        "taskStatus" character varying(32) NOT NULL,
        "priority" character varying(32) NOT NULL,
        "blockerNotes" text,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_timesheet_entries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_timesheet_entries_day"
          FOREIGN KEY ("timesheetDayId") REFERENCES "timesheet_days"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheet_entries_day"
      ON "timesheet_entries" ("timesheetDayId")
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "timesheet_days" IS 'Employee daily timesheet header (submission lifecycle)'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "timesheet_entries" IS 'Line-item work log entries for a timesheet day'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timesheet_entries_day"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timesheet_entries"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_timesheet_days_org_emp_date_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "timesheet_days"`);
  }
}
