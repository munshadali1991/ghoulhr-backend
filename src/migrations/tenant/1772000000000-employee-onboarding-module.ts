import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modular onboarding storage: core employees extended + satellite tables.
 * New tenants run this after base employee table exists.
 */
export class EmployeeOnboardingModule1772000000000 implements MigrationInterface {
  name = 'EmployeeOnboardingModule1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "firstName" character varying,
      ADD COLUMN IF NOT EXISTS "middleName" character varying,
      ADD COLUMN IF NOT EXISTS "lastName" character varying,
      ADD COLUMN IF NOT EXISTS "gender" character varying,
      ADD COLUMN IF NOT EXISTS "personalEmail" character varying,
      ADD COLUMN IF NOT EXISTS "officialEmail" character varying,
      ADD COLUMN IF NOT EXISTS "alternateMobile" character varying,
      ADD COLUMN IF NOT EXISTS "profilePhotoUrl" text,
      ADD COLUMN IF NOT EXISTS "panNumberEnc" text,
      ADD COLUMN IF NOT EXISTS "aadhaarNumberEnc" text,
      ADD COLUMN IF NOT EXISTS "passportNumber" character varying,
      ADD COLUMN IF NOT EXISTS "passportExpiry" date
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_employment_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "employmentType" character varying,
        "employmentStatus" character varying,
        "reportingManagerId" uuid,
        "hrManagerId" uuid,
        "workLocation" character varying,
        "workMode" character varying,
        "shift" character varying,
        "probationPeriodDays" integer,
        "noticePeriodDays" integer,
        "businessUnit" character varying,
        "team" character varying,
        "gradeBand" character varying,
        "costCenter" character varying,
        CONSTRAINT "PK_employee_employment_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_employment_employee" UNIQUE ("employeeId"),
        CONSTRAINT "FK_employment_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_salary_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "ctc" numeric(14,2),
        "salaryStructure" character varying,
        "basicSalary" numeric(14,2),
        "hra" numeric(14,2),
        "allowancesJson" jsonb,
        "pfApplicable" boolean DEFAULT true,
        "esicApplicable" boolean DEFAULT false,
        "taxRegime" character varying,
        CONSTRAINT "PK_employee_salary_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_salary_employee" UNIQUE ("employeeId"),
        CONSTRAINT "FK_salary_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_bank_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "accountHolderName" character varying,
        "bankName" character varying,
        "accountNumberEnc" text,
        "accountLastFour" character varying(4),
        "ifscCode" character varying,
        "branchName" character varying,
        "verificationStatus" character varying NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_employee_bank_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_bank_employee" UNIQUE ("employeeId"),
        CONSTRAINT "FK_bank_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "documentType" character varying NOT NULL,
        "fileName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "storageDriver" character varying NOT NULL DEFAULT 'inline_base64',
        "payloadEnc" text,
        "uploadedBy" uuid,
        "verificationStatus" character varying NOT NULL DEFAULT 'PENDING',
        CONSTRAINT "PK_employee_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_documents_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_access_control" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "hrmsAccessEnabled" boolean NOT NULL DEFAULT true,
        "welcomeEmailEnabled" boolean NOT NULL DEFAULT false,
        "mfaEnabled" boolean NOT NULL DEFAULT false,
        "portalRoleLabel" character varying,
        CONSTRAINT "PK_employee_access_control" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_access_employee" UNIQUE ("employeeId"),
        CONSTRAINT "FK_access_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid,
        "actorId" uuid NOT NULL,
        "action" character varying NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_employee_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emp_docs_employee" ON "employee_documents" ("employeeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emp_audit_employee" ON "employee_audit_logs" ("employeeId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_access_control"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_bank_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_salary_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_employment_details"`);
    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP COLUMN IF EXISTS "firstName",
      DROP COLUMN IF EXISTS "middleName",
      DROP COLUMN IF EXISTS "lastName",
      DROP COLUMN IF EXISTS "gender",
      DROP COLUMN IF EXISTS "personalEmail",
      DROP COLUMN IF EXISTS "officialEmail",
      DROP COLUMN IF EXISTS "alternateMobile",
      DROP COLUMN IF EXISTS "profilePhotoUrl",
      DROP COLUMN IF EXISTS "panNumberEnc",
      DROP COLUMN IF EXISTS "aadhaarNumberEnc",
      DROP COLUMN IF EXISTS "passportNumber",
      DROP COLUMN IF EXISTS "passportExpiry"
    `);
  }
}
