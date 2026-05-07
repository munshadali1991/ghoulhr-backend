import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeExperienceFields1775000000000
  implements MigrationInterface
{
  name = 'EmployeeExperienceFields1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_employment_details"
      ADD COLUMN IF NOT EXISTS "previousCompanyName" character varying(200),
      ADD COLUMN IF NOT EXISTS "previousDesignation" character varying(200),
      ADD COLUMN IF NOT EXISTS "totalExperienceYears" numeric(5,2),
      ADD COLUMN IF NOT EXISTS "lastDrawnCtc" numeric(14,2),
      ADD COLUMN IF NOT EXISTS "experienceSummary" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_employment_details"
      DROP COLUMN IF EXISTS "previousCompanyName",
      DROP COLUMN IF EXISTS "previousDesignation",
      DROP COLUMN IF EXISTS "totalExperienceYears",
      DROP COLUMN IF EXISTS "lastDrawnCtc",
      DROP COLUMN IF EXISTS "experienceSummary"
    `);
  }
}
