import { MigrationInterface, QueryRunner } from 'typeorm';

/** Legacy workType enum value → default category display name */
const LEGACY_WORK_TYPE_NAMES: Record<string, string> = {
  DEVELOPMENT: 'Development',
  BUG_FIX: 'Bug Fix',
  TESTING: 'Testing',
  MEETING: 'Meeting',
  RESEARCH: 'Research',
  DOCUMENTATION: 'Documentation',
  DEPLOYMENT: 'Deployment',
  SUPPORT: 'Support',
};

/**
 * Timesheet category master + replace timesheet_entries.workType with categoryId FK.
 */
export class TimesheetCategories1795000000000 implements MigrationInterface {
  name = 'TimesheetCategories1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timesheet_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_timesheet_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheet_categories_org_sort"
      ON "timesheet_categories" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_timesheet_categories_org_name"
      ON "timesheet_categories" ("organizationId", "name")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "timesheet_categories" IS 'Org-scoped master for employee timesheet category dropdown'
    `);

    const orgRows: { organizationId: string }[] = await queryRunner.query(`
      SELECT DISTINCT "organizationId" FROM "timesheet_days"
      UNION
      SELECT DISTINCT "organizationId" FROM "employees" WHERE "organizationId" IS NOT NULL
    `);

    for (const { organizationId } of orgRows) {
      if (!organizationId) continue;
      let order = 0;
      for (const [code, name] of Object.entries(LEGACY_WORK_TYPE_NAMES)) {
        await queryRunner.query(
          `
          INSERT INTO "timesheet_categories" ("organizationId", "name", "isActive", "sortOrder")
          SELECT $1::uuid, $2::varchar(120), true, $3::integer
          WHERE NOT EXISTS (
            SELECT 1 FROM "timesheet_categories"
            WHERE "organizationId" = $1::uuid
              AND "name" = $2::varchar(120)
              AND "deletedAt" IS NULL
          )
        `,
          [organizationId, name, order],
        );
        order += 1;
      }
    }

    await queryRunner.query(`
      ALTER TABLE "timesheet_entries"
      ADD COLUMN IF NOT EXISTS "categoryId" uuid
    `);

    await queryRunner.query(`
      UPDATE "timesheet_entries" AS e
      SET "categoryId" = c."id"
      FROM "timesheet_days" AS d,
           "timesheet_categories" AS c
      WHERE e."timesheetDayId" = d."id"
        AND c."organizationId" = d."organizationId"
        AND c."deletedAt" IS NULL
        AND c."name" = CASE e."workType"
          WHEN 'DEVELOPMENT' THEN 'Development'
          WHEN 'BUG_FIX' THEN 'Bug Fix'
          WHEN 'TESTING' THEN 'Testing'
          WHEN 'MEETING' THEN 'Meeting'
          WHEN 'RESEARCH' THEN 'Research'
          WHEN 'DOCUMENTATION' THEN 'Documentation'
          WHEN 'DEPLOYMENT' THEN 'Deployment'
          WHEN 'SUPPORT' THEN 'Support'
          ELSE 'Documentation'
        END
    `);

    await queryRunner.query(`
      UPDATE "timesheet_entries" AS e
      SET "categoryId" = sub."id"
      FROM (
        SELECT e2."id" AS entry_id, c."id"
        FROM "timesheet_entries" AS e2
        INNER JOIN "timesheet_days" AS d ON d."id" = e2."timesheetDayId"
        INNER JOIN LATERAL (
          SELECT c2."id"
          FROM "timesheet_categories" AS c2
          WHERE c2."organizationId" = d."organizationId"
            AND c2."deletedAt" IS NULL
          ORDER BY c2."sortOrder"
          LIMIT 1
        ) AS c ON true
        WHERE e2."categoryId" IS NULL
      ) AS sub
      WHERE e."id" = sub.entry_id
    `);

    await queryRunner.query(`
      ALTER TABLE "timesheet_entries"
      ALTER COLUMN "categoryId" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "timesheet_entries"
      ADD CONSTRAINT "FK_timesheet_entries_category"
      FOREIGN KEY ("categoryId") REFERENCES "timesheet_categories"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_timesheet_entries_category"
      ON "timesheet_entries" ("categoryId")
    `);

    await queryRunner.query(`
      ALTER TABLE "timesheet_entries" DROP COLUMN IF EXISTS "workType"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "timesheet_entries"
      ADD COLUMN IF NOT EXISTS "workType" character varying(32)
    `);

    await queryRunner.query(`
      UPDATE "timesheet_entries" e
      SET "workType" = CASE c."name"
        WHEN 'Development' THEN 'DEVELOPMENT'
        WHEN 'Bug Fix' THEN 'BUG_FIX'
        WHEN 'Testing' THEN 'TESTING'
        WHEN 'Meeting' THEN 'MEETING'
        WHEN 'Research' THEN 'RESEARCH'
        WHEN 'Documentation' THEN 'DOCUMENTATION'
        WHEN 'Deployment' THEN 'DEPLOYMENT'
        WHEN 'Support' THEN 'SUPPORT'
        ELSE 'DOCUMENTATION'
      END
      FROM "timesheet_categories" c
      WHERE c."id" = e."categoryId"
    `);

    await queryRunner.query(`
      ALTER TABLE "timesheet_entries" DROP CONSTRAINT IF EXISTS "FK_timesheet_entries_category"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timesheet_entries_category"`);
    await queryRunner.query(`
      ALTER TABLE "timesheet_entries" DROP COLUMN IF EXISTS "categoryId"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_timesheet_categories_org_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_timesheet_categories_org_sort"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timesheet_categories"`);
  }
}
