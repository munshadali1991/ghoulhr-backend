import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceDailySummaries1787000000000 implements MigrationInterface {
  name = 'AttendanceDailySummaries1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_daily_summaries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "workDate" date NOT NULL,
        "status" character varying(8) NOT NULL DEFAULT 'A',
        "shiftConfigurationId" uuid,
        "firstIn" TIMESTAMPTZ,
        "lastOut" TIMESTAMPTZ,
        "lateInMinutes" integer NOT NULL DEFAULT 0,
        "earlyOutMinutes" integer NOT NULL DEFAULT 0,
        "totalWorkMinutes" integer NOT NULL DEFAULT 0,
        "breakMinutes" integer NOT NULL DEFAULT 0,
        "actualWorkMinutes" integer NOT NULL DEFAULT 0,
        "remarks" text,
        "exceptionFlag" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_attendance_daily_summaries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_daily_summaries_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_daily_summaries_shift"
          FOREIGN KEY ("shiftConfigurationId") REFERENCES "work_shift_configurations"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_daily_org_emp_date"
      ON "attendance_daily_summaries" ("organizationId", "employeeId", "workDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_attendance_daily_org_emp_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_daily_summaries"`);
  }
}
