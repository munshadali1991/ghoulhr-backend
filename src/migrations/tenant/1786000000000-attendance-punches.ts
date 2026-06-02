import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendancePunches1786000000000 implements MigrationInterface {
  name = 'AttendancePunches1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_punches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "punchedAt" TIMESTAMPTZ NOT NULL,
        "punchType" character varying(8) NOT NULL,
        "source" character varying(32) NOT NULL DEFAULT 'WEB',
        "latitude" double precision,
        "longitude" double precision,
        CONSTRAINT "PK_attendance_punches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_punches_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_punches_emp_time"
      ON "attendance_punches" ("employeeId", "punchedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_punches_emp_time"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_punches"`);
  }
}
