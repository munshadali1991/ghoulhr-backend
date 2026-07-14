import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Org-scoped performance assessment master (sections, questions, rating scale)
 * and schema snapshot column on performance_assessments.
 */
export class PerformanceMaster1804000000000 implements MigrationInterface {
  name = 'PerformanceMaster1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "performance_sections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "key" character varying(64) NOT NULL,
        "title" character varying(191) NOT NULL,
        "banner" text,
        "role" character varying(16) NOT NULL,
        "scored" boolean NOT NULL DEFAULT false,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_performance_sections" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_performance_sections_org_sort"
      ON "performance_sections" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_performance_sections_org_key"
      ON "performance_sections" ("organizationId", "key")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "performance_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "sectionId" uuid NOT NULL,
        "key" character varying(64) NOT NULL,
        "label" text NOT NULL,
        "type" character varying(32) NOT NULL,
        "options" jsonb,
        "allowComment" boolean NOT NULL DEFAULT false,
        "required" boolean NOT NULL DEFAULT true,
        "helperText" text,
        "placeholder" character varying(191),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_performance_questions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_performance_questions_section"
          FOREIGN KEY ("sectionId") REFERENCES "performance_sections"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_performance_questions_org_section_sort"
      ON "performance_questions" ("organizationId", "sectionId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_performance_questions_section_key"
      ON "performance_questions" ("sectionId", "key")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "performance_rating_options" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "label" character varying(64) NOT NULL,
        "weight" integer NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_performance_rating_options" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_performance_rating_options_org_sort"
      ON "performance_rating_options" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_performance_rating_options_org_label"
      ON "performance_rating_options" ("organizationId", "label")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_assessments"
      ADD COLUMN IF NOT EXISTS "schema" jsonb
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "performance_sections" IS 'Org-scoped KRA/performance assessment section master'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "performance_questions" IS 'Org-scoped performance assessment question master'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "performance_rating_options" IS 'Org-scoped KPI rating scale with numeric weights'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "performance_assessments" DROP COLUMN IF EXISTS "schema"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_performance_rating_options_org_label"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_performance_rating_options_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_rating_options"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_performance_questions_section_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_performance_questions_org_section_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_questions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_performance_sections_org_key"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_performance_sections_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_sections"`);
  }
}
