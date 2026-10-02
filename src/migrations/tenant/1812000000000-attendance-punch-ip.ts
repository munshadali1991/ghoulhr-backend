import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendancePunchIp1812000000000 implements MigrationInterface {
  name = 'AttendancePunchIp1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      ADD COLUMN IF NOT EXISTS "ipAddress" character varying(64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      DROP COLUMN IF EXISTS "ipAddress"
    `);
  }
}
