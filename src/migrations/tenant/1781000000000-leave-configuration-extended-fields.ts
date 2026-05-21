import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extended leave policy fields (accrual, encashment, calendars, workflow, etc.).
 */
export class LeaveConfigurationExtendedFields1781000000000
  implements MigrationInterface
{
  name = 'LeaveConfigurationExtendedFields1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "description" text
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "accrualType" character varying(32) NOT NULL DEFAULT 'MONTHLY'
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "encashmentAllowed" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "negativeBalanceAllowed" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "supportingDocumentAfterDays" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "weekendsCountAsLeave" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "holidaysCountAsLeave" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "approvalWorkflow" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_configurations"
      ADD COLUMN IF NOT EXISTS "appliesTo" character varying(32) NOT NULL DEFAULT 'ALL_EMPLOYEES'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "appliesTo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "approvalWorkflow"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "holidaysCountAsLeave"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "weekendsCountAsLeave"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "supportingDocumentAfterDays"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "negativeBalanceAllowed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "encashmentAllowed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "accrualType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_configurations" DROP COLUMN IF EXISTS "description"`,
    );
  }
}
