import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Skills master (category → subcategory → skill) plus employee self-service assignments.
 */
export class SkillsModule1814000000000 implements MigrationInterface {
  name = 'SkillsModule1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_skill_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_categories_org_sort"
      ON "skill_categories" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_skill_categories_org_name"
      ON "skill_categories" ("organizationId", "name")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "skill_categories" IS 'Org-scoped skill domain categories'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_subcategories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "categoryId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_skill_subcategories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_skill_subcategories_category"
          FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_subcategories_org_sort"
      ON "skill_subcategories" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_subcategories_org_category"
      ON "skill_subcategories" ("organizationId", "categoryId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_skill_subcategories_org_category_name"
      ON "skill_subcategories" ("organizationId", "categoryId", "name")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "skill_subcategories" IS 'Org-scoped skill sub-fields under a category'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "categoryId" uuid NOT NULL,
        "subcategoryId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_skills" PRIMARY KEY ("id"),
        CONSTRAINT "FK_skills_category"
          FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_skills_subcategory"
          FOREIGN KEY ("subcategoryId") REFERENCES "skill_subcategories"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skills_org_sort"
      ON "skills" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skills_org_category"
      ON "skills" ("organizationId", "categoryId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skills_org_subcategory"
      ON "skills" ("organizationId", "subcategoryId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_skills_org_subcategory_name"
      ON "skills" ("organizationId", "subcategoryId", "name")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "skills" IS 'Org-scoped skill master rows linked to category and subcategory'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "employeeId" uuid NOT NULL,
        "skillId" uuid NOT NULL,
        "experienceMonths" integer NOT NULL,
        "proficiency" character varying(16) NOT NULL,
        CONSTRAINT "PK_employee_skills" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_skills_employee"
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_skills_skill"
          FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_employee_skills_experience"
          CHECK ("experienceMonths" >= 0 AND "experienceMonths" <= 720),
        CONSTRAINT "CHK_employee_skills_proficiency"
          CHECK ("proficiency" IN ('BEGINNER', 'GOOD', 'EXPERT'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_skills_org_employee"
      ON "employee_skills" ("organizationId", "employeeId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employee_skills_skill"
      ON "employee_skills" ("skillId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employee_skills_employee_skill"
      ON "employee_skills" ("employeeId", "skillId")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "employee_skills" IS 'Employee self-service skill assignments with experience and proficiency'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_employee_skills_employee_skill"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_skills_skill"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employee_skills_org_employee"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_skills"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_skills_org_subcategory_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skills_org_subcategory"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skills_org_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skills_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skills"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_skill_subcategories_org_category_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skill_subcategories_org_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skill_subcategories_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_subcategories"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_skill_categories_org_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_skill_categories_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_categories"`);
  }
}
