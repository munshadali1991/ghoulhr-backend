import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyDepartmentDesignation1776000000001
  implements MigrationInterface
{
  name = 'DropLegacyDepartmentDesignation1776000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP COLUMN IF EXISTS "department",
      DROP COLUMN IF EXISTS "designation"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "department" character varying,
      ADD COLUMN IF NOT EXISTS "designation" character varying
    `);
  }
}
