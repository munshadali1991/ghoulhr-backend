import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpenseClaims1818000000000 implements MigrationInterface {
  name = 'ExpenseClaims1818000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "code" character varying(64) NOT NULL,
        "name" character varying(128) NOT NULL,
        "description" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "receiptRequiredAboveAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "maxAmountPerLine" numeric(14,2),
        "claimWindowDays" integer,
        CONSTRAINT "PK_expense_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "expense_categories" IS
      'Master expense categories with receipt and amount policy'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_categories_org_code"
      ON "expense_categories" ("organizationId", "code")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_categories_org_active"
      ON "expense_categories" ("organizationId", "isActive")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_claims" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "claimNumber" character varying(32) NOT NULL,
        "title" character varying(255) NOT NULL,
        "purpose" text,
        "status" character varying(32) NOT NULL DEFAULT 'DRAFT',
        "currency" character varying(3) NOT NULL DEFAULT 'INR',
        "totalAmount" numeric(14,2) NOT NULL DEFAULT 0,
        "managerEmployeeId" uuid,
        "managerActionAt" TIMESTAMPTZ,
        "managerNotes" text,
        "financeActorEmployeeId" uuid,
        "financeActionAt" TIMESTAMPTZ,
        "financeNotes" text,
        "rejectionReason" text,
        "rejectedByEmployeeId" uuid,
        "rejectedAt" TIMESTAMPTZ,
        "sendBackReason" text,
        "sendBackByEmployeeId" uuid,
        "sendBackAt" TIMESTAMPTZ,
        "paidAt" TIMESTAMPTZ,
        "paidByEmployeeId" uuid,
        "paymentReference" character varying(128),
        "paymentMode" character varying(32),
        "submittedAt" TIMESTAMPTZ,
        "approvedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_expense_claims" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_claims_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_claims_manager"
          FOREIGN KEY ("managerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_expense_claims_finance"
          FOREIGN KEY ("financeActorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_expense_claims_rejected_by"
          FOREIGN KEY ("rejectedByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_expense_claims_send_back_by"
          FOREIGN KEY ("sendBackByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_expense_claims_paid_by"
          FOREIGN KEY ("paidByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "expense_claims" IS
      'Employee expense reimbursement claims (header)'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_claims_org_number"
      ON "expense_claims" ("organizationId", "claimNumber")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claims_org_emp_status"
      ON "expense_claims" ("organizationId", "employeeId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claims_manager_status"
      ON "expense_claims" ("managerEmployeeId", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claims_org_status"
      ON "expense_claims" ("organizationId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_claim_lines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "claimId" uuid NOT NULL,
        "lineNo" integer NOT NULL,
        "categoryId" uuid NOT NULL,
        "expenseDate" date NOT NULL,
        "merchant" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "amount" numeric(14,2) NOT NULL,
        "receiptDocumentId" uuid,
        CONSTRAINT "PK_expense_claim_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_claim_lines_claim"
          FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_claim_lines_category"
          FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_expense_claim_lines_receipt"
          FOREIGN KEY ("receiptDocumentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "expense_claim_lines" IS
      'Individual expense line items with optional receipt'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claim_lines_claim"
      ON "expense_claim_lines" ("claimId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claim_lines_org_date"
      ON "expense_claim_lines" ("organizationId", "expenseDate")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_claim_lines_claim_lineno"
      ON "expense_claim_lines" ("claimId", "lineNo")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_claim_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "claimId" uuid NOT NULL,
        "action" character varying(64) NOT NULL,
        "actorEmployeeId" uuid,
        "fromStatus" character varying(32),
        "toStatus" character varying(32),
        "payloadJson" jsonb,
        CONSTRAINT "PK_expense_claim_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_claim_audit_claim"
          FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expense_claim_audit_actor"
          FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "expense_claim_audit_logs" IS
      'Append-only audit trail for expense claim transitions'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_claim_audit_claim"
      ON "expense_claim_audit_logs" ("claimId", "createdAt")
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      ADD COLUMN IF NOT EXISTS "expenseClaimId" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP CONSTRAINT IF EXISTS "FK_employee_notifications_expense_claim"
    `);

    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      ADD CONSTRAINT "FK_employee_notifications_expense_claim"
      FOREIGN KEY ("expenseClaimId")
      REFERENCES "expense_claims"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP CONSTRAINT IF EXISTS "FK_employee_notifications_expense_claim"
    `);
    await queryRunner.query(`
      ALTER TABLE "employee_notifications"
      DROP COLUMN IF EXISTS "expenseClaimId"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expense_claim_audit_claim"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_claim_audit_logs"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_expense_claim_lines_claim_lineno"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_claim_lines_org_date"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_claim_lines_claim"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_claim_lines"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expense_claims_org_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_claims_manager_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_claims_org_emp_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_expense_claims_org_number"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_claims"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expense_categories_org_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_expense_categories_org_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expense_categories"`);
  }
}
