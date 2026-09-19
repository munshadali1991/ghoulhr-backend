import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move leave supporting files out of employee_documents into leave_attachments.
 * Preserves UUIDs referenced by leave_requests.supportingDocumentId.
 */
export class LeaveAttachments1820000000000 implements MigrationInterface {
  name = 'LeaveAttachments1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "leaveRequestId" uuid,
        "fileName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "storageDriver" character varying NOT NULL DEFAULT 's3',
        "storageKey" character varying(1024),
        "payloadEnc" text,
        "uploadedBy" uuid,
        "verificationStatus" character varying NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_leave_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_attachments_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "leave_attachments" IS
      'Leave supporting attachments (domain-owned; not HR employee_documents)'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_attachments_org_emp"
      ON "leave_attachments" ("organizationId", "employeeId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_attachments_leave_request"
      ON "leave_attachments" ("leaveRequestId")
      WHERE "leaveRequestId" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_attachments_storage_key"
      ON "leave_attachments" ("storageKey")
      WHERE "storageKey" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "leave_attachments" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "organizationId", "employeeId", "leaveRequestId",
        "fileName", "mimeType", "sizeBytes", "storageDriver", "storageKey",
        "payloadEnc", "uploadedBy", "verificationStatus"
      )
      SELECT
        ed."id",
        ed."createdAt",
        ed."updatedAt",
        ed."deletedAt",
        lr."organizationId",
        lr."employeeId",
        lr."id",
        ed."fileName",
        ed."mimeType",
        ed."sizeBytes",
        COALESCE(ed."storageDriver", 's3'),
        ed."storageKey",
        ed."payloadEnc",
        ed."uploadedBy",
        COALESCE(ed."verificationStatus", 'PENDING')
      FROM "leave_requests" lr
      INNER JOIN "employee_documents" ed ON ed."id" = lr."supportingDocumentId"
      WHERE lr."supportingDocumentId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "leave_attachments" la WHERE la."id" = ed."id"
        )
    `);

    await queryRunner.query(`
      INSERT INTO "leave_attachments" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "organizationId", "employeeId", "leaveRequestId",
        "fileName", "mimeType", "sizeBytes", "storageDriver", "storageKey",
        "payloadEnc", "uploadedBy", "verificationStatus"
      )
      SELECT
        ed."id",
        ed."createdAt",
        ed."updatedAt",
        ed."deletedAt",
        e."organizationId",
        e."id",
        NULL,
        ed."fileName",
        ed."mimeType",
        ed."sizeBytes",
        COALESCE(ed."storageDriver", 's3'),
        ed."storageKey",
        ed."payloadEnc",
        ed."uploadedBy",
        COALESCE(ed."verificationStatus", 'PENDING')
      FROM "employee_documents" ed
      INNER JOIN "employees" e ON e."id" = ed."employeeId"
      WHERE ed."documentType" = 'LEAVE_SUPPORTING'
        AND NOT EXISTS (
          SELECT 1 FROM "leave_attachments" la WHERE la."id" = ed."id"
        )
    `);

    const verify = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "leave_requests"
          WHERE "supportingDocumentId" IS NOT NULL AND "deletedAt" IS NULL) AS linked_leaves,
        (SELECT COUNT(*)::int FROM "leave_attachments" la
          INNER JOIN "leave_requests" lr ON lr."supportingDocumentId" = la."id"
          WHERE lr."deletedAt" IS NULL) AS linked_attachments
    `);
    const linkedLeaves = Number(verify?.[0]?.linked_leaves ?? 0);
    const linkedAttachments = Number(verify?.[0]?.linked_attachments ?? 0);
    if (linkedLeaves !== linkedAttachments) {
      throw new Error(
        `Leave attachment migration verification failed: linked_leaves=${linkedLeaves} linked_attachments=${linkedAttachments}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP CONSTRAINT IF EXISTS "FK_leave_requests_supporting_document"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP CONSTRAINT IF EXISTS "FK_leave_requests_document"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD CONSTRAINT "FK_leave_requests_supporting_document"
      FOREIGN KEY ("supportingDocumentId") REFERENCES "leave_attachments"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_attachments"
      ADD CONSTRAINT "FK_leave_attachments_leave_request"
      FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      DELETE FROM "employee_documents" ed
      WHERE EXISTS (SELECT 1 FROM "leave_attachments" la WHERE la."id" = ed."id")
         OR ed."documentType" = 'LEAVE_SUPPORTING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_attachments"
      DROP CONSTRAINT IF EXISTS "FK_leave_attachments_leave_request"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP CONSTRAINT IF EXISTS "FK_leave_requests_supporting_document"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP CONSTRAINT IF EXISTS "FK_leave_requests_document"
    `);

    await queryRunner.query(`
      INSERT INTO "employee_documents" (
        "id", "createdAt", "updatedAt", "deletedAt",
        "employeeId", "documentType", "fileName", "mimeType", "sizeBytes",
        "storageDriver", "storageKey", "payloadEnc", "uploadedBy", "verificationStatus"
      )
      SELECT
        la."id", la."createdAt", la."updatedAt", la."deletedAt",
        la."employeeId", 'LEAVE_SUPPORTING', la."fileName", la."mimeType", la."sizeBytes",
        la."storageDriver", la."storageKey", la."payloadEnc", la."uploadedBy", la."verificationStatus"
      FROM "leave_attachments" la
      WHERE NOT EXISTS (
        SELECT 1 FROM "employee_documents" ed WHERE ed."id" = la."id"
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD CONSTRAINT "FK_leave_requests_document"
      FOREIGN KEY ("supportingDocumentId") REFERENCES "employee_documents"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "leave_attachments"`);
  }
}
