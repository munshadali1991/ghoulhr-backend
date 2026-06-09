import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceSummaryMetrics1796100000000 implements MigrationInterface {
  name = 'AttendanceSummaryMetrics1796100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries"
      ADD COLUMN IF NOT EXISTS "workInShiftMinutes" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries"
      ADD COLUMN IF NOT EXISTS "shortfallMinutes" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries"
      ADD COLUMN IF NOT EXISTS "excessMinutes" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries" DROP COLUMN IF EXISTS "excessMinutes"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries" DROP COLUMN IF EXISTS "shortfallMinutes"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_daily_summaries" DROP COLUMN IF EXISTS "workInShiftMinutes"
    `);
  }
}
