import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move expense receipts out of employee_documents into expense_receipts.
 * Preserves UUIDs referenced by expense_claim_lines.receiptDocumentId.
 */
export class ExpenseReceipts1819000000000 implements MigrationInterface {
  name = 'ExpenseReceipts1819000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "expense_receipts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "claimId" uuid,
        "claimLineId" uuid,
        "fileName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "storageDriver" character varying NOT NULL DEFAULT 's3',
        "storageKey" character varying(1024),
        "uploadedBy" uuid,
        "verificationStatus" character varying NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_expense_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expense_receipts_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "expense_receipts" IS
      'Expense claim line receipts (domain-owned; not HR employee_documents)'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_receipts_org_emp"
      ON "expense_receipts" ("organizationId", "employeeId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_expense_receipts_claim"
      ON "expense_receipts" ("claimId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_receipts_claim_line"
      ON "expense_receipts" ("claimLineId")
      WHERE "claimLineId" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expense_receipts_storage_key"
      ON "expense_receipts" ("storageKey")
      WHERE "storageKey" IS NOT NULL AND "deletedAt" IS NULL
    `);

    // Linked receipts (preserve id)
    await queryRunner.query(`
      INSERT INTO "expense_receipts" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "organizationId", "employeeId", "claimId", "claimLineId",
        "fileName", "mimeType", "sizeBytes", "storageDriver", "storageKey",
        "uploadedBy", "verificationStatus"
      )
      SELECT
        ed."id",
        ed."createdAt",
        ed."updatedAt",
        ed."deletedAt",
        l."organizationId",
        e."id",
        l."claimId",
        l."id",
        ed."fileName",
        ed."mimeType",
        ed."sizeBytes",
        COALESCE(ed."storageDriver", 's3'),
        ed."storageKey",
        ed."uploadedBy",
        COALESCE(ed."verificationStatus", 'PENDING')
      FROM "expense_claim_lines" l
      INNER JOIN "employee_documents" ed ON ed."id" = l."receiptDocumentId"
      INNER JOIN "employees" e ON e."id" = ed."employeeId"
      WHERE l."receiptDocumentId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "expense_receipts" er WHERE er."id" = ed."id"
        )
    `);

    // Orphan EXPENSE_RECEIPT rows (no line FK)
    await queryRunner.query(`
      INSERT INTO "expense_receipts" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "organizationId", "employeeId", "claimId", "claimLineId",
        "fileName", "mimeType", "sizeBytes", "storageDriver", "storageKey",
        "uploadedBy", "verificationStatus"
      )
      SELECT
        ed."id",
        ed."createdAt",
        ed."updatedAt",
        ed."deletedAt",
        e."organizationId",
        e."id",
        NULL,
        NULL,
        ed."fileName",
        ed."mimeType",
        ed."sizeBytes",
        COALESCE(ed."storageDriver", 's3'),
        ed."storageKey",
        ed."uploadedBy",
        COALESCE(ed."verificationStatus", 'PENDING')
      FROM "employee_documents" ed
      INNER JOIN "employees" e ON e."id" = ed."employeeId"
      WHERE ed."documentType" = 'EXPENSE_RECEIPT'
        AND NOT EXISTS (
          SELECT 1 FROM "expense_receipts" er WHERE er."id" = ed."id"
        )
    `);

    const verify = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "expense_claim_lines"
          WHERE "receiptDocumentId" IS NOT NULL AND "deletedAt" IS NULL) AS linked_lines,
        (SELECT COUNT(*)::int FROM "expense_receipts" er
          INNER JOIN "expense_claim_lines" l ON l."receiptDocumentId" = er."id"
          WHERE l."deletedAt" IS NULL) AS linked_receipts
    `);
    const linkedLines = Number(verify?.[0]?.linked_lines ?? 0);
    const linkedReceipts = Number(verify?.[0]?.linked_receipts ?? 0);
    if (linkedLines !== linkedReceipts) {
      throw new Error(
        `Expense receipt migration verification failed: linked_lines=${linkedLines} linked_receipts=${linkedReceipts}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "expense_claim_lines"
      DROP CONSTRAINT IF EXISTS "FK_expense_claim_lines_receipt"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_claim_lines"
      ADD CONSTRAINT "FK_expense_claim_lines_receipt"
      FOREIGN KEY ("receiptDocumentId") REFERENCES "expense_receipts"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_receipts"
      ADD CONSTRAINT "FK_expense_receipts_claim"
      FOREIGN KEY ("claimId") REFERENCES "expense_claims"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_receipts"
      ADD CONSTRAINT "FK_expense_receipts_claim_line"
      FOREIGN KEY ("claimLineId") REFERENCES "expense_claim_lines"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      DELETE FROM "employee_documents" ed
      WHERE EXISTS (SELECT 1 FROM "expense_receipts" er WHERE er."id" = ed."id")
         OR ed."documentType" = 'EXPENSE_RECEIPT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_receipts"
      DROP CONSTRAINT IF EXISTS "FK_expense_receipts_claim_line"
    `);
    await queryRunner.query(`
      ALTER TABLE "expense_receipts"
      DROP CONSTRAINT IF EXISTS "FK_expense_receipts_claim"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_claim_lines"
      DROP CONSTRAINT IF EXISTS "FK_expense_claim_lines_receipt"
    `);

    await queryRunner.query(`
      INSERT INTO "employee_documents" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "employeeId", "documentType", "fileName", "mimeType", "sizeBytes",
        "storageDriver", "storageKey", "uploadedBy", "verificationStatus"
      )
      SELECT
        er."id", er."createdAt", er."updatedAt", er."deletedAt",
        er."employeeId", 'EXPENSE_RECEIPT', er."fileName", er."mimeType", er."sizeBytes",
        er."storageDriver", er."storageKey", er."uploadedBy", er."verificationStatus"
      FROM "expense_receipts" er
      WHERE NOT EXISTS (
        SELECT 1 FROM "employee_documents" ed WHERE ed."id" = er."id"
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_claim_lines"
      ADD CONSTRAINT "FK_expense_claim_lines_receipt"
      FOREIGN KEY ("receiptDocumentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "expense_receipts"`);
  }
}
