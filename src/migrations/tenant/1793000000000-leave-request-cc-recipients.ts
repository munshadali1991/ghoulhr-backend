import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-recipient Cc on leave requests (replaces org-wide notify-all for apply form).
 */
export class LeaveRequestCcRecipients1793000000000 implements MigrationInterface {
  name = 'LeaveRequestCcRecipients1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_request_cc_recipients" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "leaveRequestId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        CONSTRAINT "PK_leave_request_cc_recipients" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leave_request_cc_recipient"
          UNIQUE ("leaveRequestId", "employeeId"),
        CONSTRAINT "FK_leave_request_cc_leave_request"
          FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_request_cc_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_request_cc_leave_request"
      ON "leave_request_cc_recipients" ("leaveRequestId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_request_cc_leave_request"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_request_cc_recipients"`);
  }
}
