import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceSessions1788000000000 implements MigrationInterface {
  name = 'AttendanceSessions1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "dailySummaryId" uuid NOT NULL,
        "sessionLabel" character varying(64) NOT NULL,
        "sessionStart" TIMESTAMPTZ,
        "sessionEnd" TIMESTAMPTZ,
        "firstIn" TIMESTAMPTZ,
        "lastOut" TIMESTAMPTZ,
        CONSTRAINT "PK_attendance_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_sessions_summary"
          FOREIGN KEY ("dailySummaryId") REFERENCES "attendance_daily_summaries"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_sessions_summary"
      ON "attendance_sessions" ("dailySummaryId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_attendance_sessions_summary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_sessions"`);
  }
}
