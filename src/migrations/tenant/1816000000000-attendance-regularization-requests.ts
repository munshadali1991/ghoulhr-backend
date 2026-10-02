import { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceRegularizationRequests1816000000000
  implements MigrationInterface
{
  name = 'AttendanceRegularizationRequests1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_regularization_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "workDate" date NOT NULL,
        "requestedInAt" TIMESTAMPTZ NOT NULL,
        "requestedOutAt" TIMESTAMPTZ NOT NULL,
        "reason" text NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'PENDING',
        "approverEmployeeId" uuid,
        "rejectionReason" text,
        "approvalNotes" text,
        "appliedOn" date NOT NULL DEFAULT CURRENT_DATE,
        CONSTRAINT "PK_attendance_regularization_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_att_reg_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_att_reg_approver"
          FOREIGN KEY ("approverEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "attendance_regularization_requests" IS
      'Employee forgotten check-in/out requests awaiting manager approval'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_reg_org_emp_status"
      ON "attendance_regularization_requests" ("organizationId", "employeeId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_att_reg_approver_status"
      ON "attendance_regularization_requests" ("approverEmployeeId", "status")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_att_reg_pending_emp_date"
      ON "attendance_regularization_requests" ("employeeId", "workDate")
      WHERE "status" = 'PENDING' AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      ADD COLUMN IF NOT EXISTS "attendanceRegularizationRequestId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP CONSTRAINT IF EXISTS "FK_employee_notifications_att_reg"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      ADD CONSTRAINT "FK_employee_notifications_att_reg"
      FOREIGN KEY ("attendanceRegularizationRequestId")
      REFERENCES "attendance_regularization_requests"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP CONSTRAINT IF EXISTS "FK_employee_notifications_att_reg"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP COLUMN IF EXISTS "attendanceRegularizationRequestId"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_att_reg_pending_emp_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_att_reg_approver_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_att_reg_org_emp_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "attendance_regularization_requests"`,
    );
  }
}
