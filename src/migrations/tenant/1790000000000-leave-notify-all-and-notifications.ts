import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Org-wide leave Cc: notifyAllEmployees flag + in-app notification ledger.
 */
export class LeaveNotifyAllAndNotifications1790000000000
  implements MigrationInterface
{
  name = 'LeaveNotifyAllAndNotifications1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "notifyAllEmployees" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "recipientEmployeeId" uuid NOT NULL,
        "leaveRequestId" uuid,
        "type" character varying(64) NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "readAt" TIMESTAMPTZ,
        CONSTRAINT "PK_employee_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_notifications_recipient"
          FOREIGN KEY ("recipientEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_notifications_leave_request"
          FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_notifications_recipient_read"
      ON "employee_notifications" ("recipientEmployeeId", "readAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_notifications_org_recipient"
      ON "employee_notifications" ("organizationId", "recipientEmployeeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_employee_notifications_org_recipient"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_employee_notifications_recipient_read"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_notifications"`);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP COLUMN IF EXISTS "notifyAllEmployees"
    `);
  }
}
