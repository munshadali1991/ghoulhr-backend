import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveRequestApproverNotes1797000000000 implements MigrationInterface {
  name = 'LeaveRequestApproverNotes1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "rejectionReason" text,
      ADD COLUMN IF NOT EXISTS "approvalNotes" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP COLUMN IF EXISTS "rejectionReason",
      DROP COLUMN IF EXISTS "approvalNotes"
    `);
  }
}
