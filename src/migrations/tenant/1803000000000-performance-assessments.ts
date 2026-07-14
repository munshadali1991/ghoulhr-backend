import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KRA / Performance self-assessment module.
 * Assessment instances per employee/cycle + flexible key/value answer rows.
 */
export class PerformanceAssessments1803000000000
  implements MigrationInterface
{
  name = 'PerformanceAssessments1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "performance_assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "templateKey" character varying(64) NOT NULL,
        "cycleLabel" character varying(191) NOT NULL,
        "description" text,
        "dueDate" date,
        "status" character varying(32) NOT NULL DEFAULT 'DRAFT',
        "score" numeric(5,2) NOT NULL DEFAULT 0,
        "alignManagerEmployeeId" uuid,
        "submittedAt" TIMESTAMPTZ,
        "managerReviewedAt" TIMESTAMPTZ,
        "hrReviewedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_performance_assessments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_assessments_org_emp_template_cycle"
          UNIQUE ("organizationId", "employeeId", "templateKey", "cycleLabel"),
        CONSTRAINT "FK_performance_assessments_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_assessments_align_manager"
          FOREIGN KEY ("alignManagerEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_performance_assessments_org_emp_status"
      ON "performance_assessments" ("organizationId", "employeeId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "performance_answers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "assessmentId" uuid NOT NULL,
        "questionKey" character varying(64) NOT NULL,
        "section" character varying(64),
        "answerType" character varying(32),
        "valueText" text,
        "valueRating" character varying(64),
        "valueNumber" numeric(12,2),
        "comment" text,
        "filledByRole" character varying(16) NOT NULL DEFAULT 'EMPLOYEE',
        CONSTRAINT "PK_performance_answers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_answers_assessment_question"
          UNIQUE ("assessmentId", "questionKey"),
        CONSTRAINT "FK_performance_answers_assessment"
          FOREIGN KEY ("assessmentId") REFERENCES "performance_assessments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_performance_answers_assessment"
      ON "performance_answers" ("assessmentId")
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "performance_assessments" IS 'KRA/self-assessment instances per employee and review cycle'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "performance_answers" IS 'Key/value answer rows keyed by frontend questionKey'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_answers_assessment"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_answers"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_assessments_org_emp_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_assessments"`);
  }
}
