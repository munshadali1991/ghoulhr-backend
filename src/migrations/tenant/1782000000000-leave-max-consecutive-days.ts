import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HR cap on consecutive days per single leave booking.
 */
export class LeaveMaxConsecutiveDays1782000000000 implements MigrationInterface {
  name = 'LeaveMaxConsecutiveDays1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "maxConsecutiveDays" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      DROP COLUMN IF EXISTS "maxConsecutiveDays"
    `);
  }
}
