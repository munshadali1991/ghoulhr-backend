import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkShiftIsActive1811000000000 implements MigrationInterface {
  name = 'WorkShiftIsActive1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_shift_configurations"
      ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "work_shift_configurations"
      DROP COLUMN IF EXISTS "isActive"
    `);
  }
}
