import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organization calendar module: header per year + holiday rows.
 * Migrates legacy organization_holidays then drops that table.
 */
export class OrganizationCalendars1791000000000 implements MigrationInterface {
  name = 'OrganizationCalendars1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_calendars" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "calendarYear" smallint NOT NULL,
        "name" character varying(191) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'PUBLISHED',
        CONSTRAINT "PK_organization_calendars" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organization_calendars_org_year" UNIQUE ("organizationId", "calendarYear")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_organization_calendars_org"
      ON "organization_calendars" ("organizationId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_calendar_holidays" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "calendarId" uuid NOT NULL,
        "locationId" uuid,
        "holidayDate" date NOT NULL,
        "name" character varying(191) NOT NULL,
        "holidayType" character varying(32) NOT NULL DEFAULT 'GENERAL',
        CONSTRAINT "PK_organization_calendar_holidays" PRIMARY KEY ("id"),
        CONSTRAINT "FK_calendar_holidays_calendar"
          FOREIGN KEY ("calendarId") REFERENCES "organization_calendars"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_calendar_holidays_org_date"
      ON "organization_calendar_holidays" ("organizationId", "holidayDate")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_calendar_holidays_calendar"
      ON "organization_calendar_holidays" ("calendarId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_calendar_holidays_cal_loc_date_name"
      ON "organization_calendar_holidays" (
        "calendarId",
        COALESCE("locationId", '00000000-0000-0000-0000-000000000000'::uuid),
        "holidayDate",
        "name"
      )
    `);

    const hasLegacy = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'organization_holidays'
      ) AS "exists"
    `);

    if (hasLegacy?.[0]?.exists) {
      await queryRunner.query(`
        INSERT INTO "organization_calendars" ("organizationId", "calendarYear", "name", "status")
        SELECT DISTINCT
          "organizationId",
          EXTRACT(YEAR FROM "holidayDate"::date)::smallint,
          EXTRACT(YEAR FROM "holidayDate"::date)::text || ' Official Calendar',
          'PUBLISHED'
        FROM "organization_holidays"
        WHERE "deletedAt" IS NULL
        ON CONFLICT ("organizationId", "calendarYear") DO NOTHING
      `);

      await queryRunner.query(`
        INSERT INTO "organization_calendar_holidays" (
          "organizationId", "calendarId", "locationId", "holidayDate", "name", "holidayType"
        )
        SELECT
          oh."organizationId",
          oc."id",
          oh."locationId",
          oh."holidayDate",
          oh."name",
          oh."holidayType"
        FROM "organization_holidays" oh
        INNER JOIN "organization_calendars" oc
          ON oc."organizationId" = oh."organizationId"
          AND oc."calendarYear" = EXTRACT(YEAR FROM oh."holidayDate"::date)::smallint
        WHERE oh."deletedAt" IS NULL
      `);

      await queryRunner.query(`DROP TABLE IF EXISTS "organization_holidays"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_holidays" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "locationId" uuid,
        "holidayDate" date NOT NULL,
        "name" character varying(191) NOT NULL,
        "holidayType" character varying(32) NOT NULL DEFAULT 'GENERAL',
        CONSTRAINT "PK_organization_holidays" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "organization_holidays" (
        "organizationId", "locationId", "holidayDate", "name", "holidayType"
      )
      SELECT
        h."organizationId",
        h."locationId",
        h."holidayDate",
        h."name",
        h."holidayType"
      FROM "organization_calendar_holidays" h
      WHERE h."deletedAt" IS NULL
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "organization_calendar_holidays"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_calendars"`);
  }
}
