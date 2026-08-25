import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentCentre1813000000000 implements MigrationInterface {
  name = 'DocumentCentre1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_centre_upload_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "type" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL DEFAULT 'PENDING',
        "periodMonth" integer,
        "periodYear" integer,
        "financialYear" character varying(16),
        "originalFileName" character varying(512),
        "storageKey" character varying(1024),
        "storageDriver" character varying(32) DEFAULT 's3',
        "rowCount" integer NOT NULL DEFAULT 0,
        "successCount" integer NOT NULL DEFAULT 0,
        "errorCount" integer NOT NULL DEFAULT 0,
        "errors" jsonb,
        "uploadedByEmployeeId" uuid,
        CONSTRAINT "PK_document_centre_upload_batches" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doc_centre_batches_org"
      ON "document_centre_upload_batches" ("organizationId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_centre_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "category" character varying(32) NOT NULL,
        "subcategory" character varying(32),
        "employeeId" uuid,
        "title" character varying(512) NOT NULL,
        "originalFileName" character varying(512) NOT NULL,
        "mimeType" character varying(128) NOT NULL,
        "sizeBytes" integer NOT NULL DEFAULT 0,
        "periodMonth" integer,
        "periodYear" integer,
        "financialYear" character varying(16),
        "storageKey" character varying(1024) NOT NULL,
        "storageDriver" character varying(32) NOT NULL DEFAULT 's3',
        "salaryBreakdown" jsonb,
        "uploadBatchId" uuid,
        "uploadedByEmployeeId" uuid,
        CONSTRAINT "PK_document_centre_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doc_centre_docs_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_doc_centre_docs_batch"
          FOREIGN KEY ("uploadBatchId") REFERENCES "document_centre_upload_batches"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doc_centre_docs_org_category"
      ON "document_centre_documents" ("organizationId", "category")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doc_centre_docs_employee"
      ON "document_centre_documents" ("organizationId", "employeeId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_doc_centre_payslip_period"
      ON "document_centre_documents" ("organizationId", "employeeId", "periodMonth", "periodYear")
      WHERE "deletedAt" IS NULL AND "category" = 'PAYSLIP'
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_doc_centre_form16_fy"
      ON "document_centre_documents" ("organizationId", "employeeId", "financialYear")
      WHERE "deletedAt" IS NULL AND "category" = 'FORM16'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_doc_centre_form16_fy"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_doc_centre_payslip_period"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_doc_centre_docs_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_doc_centre_docs_org_category"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "document_centre_documents"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_doc_centre_batches_org"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "document_centre_upload_batches"`,
    );
  }
}
