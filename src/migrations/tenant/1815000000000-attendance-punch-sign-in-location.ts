import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendancePunchSignInLocation1815000000000
  implements MigrationInterface
{
  name = 'AttendancePunchSignInLocation1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      ADD COLUMN IF NOT EXISTS "signInLocation" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      DROP COLUMN IF EXISTS "signInLocation"
    `);
  }
}
