import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * employee_audit_logs was created without BaseEntity columns (updatedAt, deletedAt).
 * TypeORM inserts them → "column does not exist" and HR onboarding failed.
 */
export class FixEmployeeAuditLogsBaseColumns1773000000000 implements MigrationInterface {
  name = 'FixEmployeeAuditLogsBaseColumns1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_audit_logs"
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_audit_logs"
      DROP COLUMN IF EXISTS "deletedAt",
      DROP COLUMN IF EXISTS "updatedAt"
    `);
  }
}
