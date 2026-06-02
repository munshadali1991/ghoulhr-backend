import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee leave request ledger (ESS submissions and approval lifecycle).
 */
export class LeaveRequests1784000000000 implements MigrationInterface {
  name = 'LeaveRequests1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "leaveConfigurationId" uuid NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'PENDING',
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "startSession" character varying(64) NOT NULL,
        "endSession" character varying(64) NOT NULL,
        "daysCount" numeric(6,2) NOT NULL,
        "reason" text,
        "contactDetails" text,
        "approverEmployeeId" uuid,
        "supportingDocumentId" uuid,
        "appliedOn" date NOT NULL DEFAULT CURRENT_DATE,
        CONSTRAINT "PK_leave_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_requests_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_requests_leave_config"
          FOREIGN KEY ("leaveConfigurationId") REFERENCES "leave_configurations"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "FK_leave_requests_approver"
          FOREIGN KEY ("approverEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_requests_document"
          FOREIGN KEY ("supportingDocumentId") REFERENCES "employee_documents"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_requests_org_emp_status"
      ON "leave_requests" ("organizationId", "employeeId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_requests_emp_dates"
      ON "leave_requests" ("employeeId", "startDate", "endDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leave_requests_emp_dates"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_requests_org_emp_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
  }
}
