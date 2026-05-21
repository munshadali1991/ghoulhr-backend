import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkShifts1777000000000 implements MigrationInterface {
  name = 'WorkShifts1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "work_shifts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid,
        "name" character varying(191) NOT NULL,
        "startTime" character varying(5) NOT NULL,
        "endTime" character varying(5) NOT NULL,
        "breakMinutes" integer NOT NULL DEFAULT 0,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "locationName" character varying(191),
        "locationAddress" text,
        "locationCity" character varying(120),
        "locationRegion" character varying(120),
        "locationPostalCode" character varying(32),
        "locationCountry" character varying(120),
        "locationLatitude" numeric(10,7),
        "locationLongitude" numeric(10,7),
        CONSTRAINT "PK_work_shifts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_work_shifts_organizationId_sortOrder"
      ON "work_shifts" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      INSERT INTO "work_shifts" (
        "organizationId",
        "name",
        "startTime",
        "endTime",
        "breakMinutes",
        "sortOrder"
      )
      SELECT
        (SELECT e."organizationId" FROM "employees" e WHERE e."organizationId" IS NOT NULL LIMIT 1),
        COALESCE(NULLIF(TRIM(t.shift->>'name'), ''), 'Shift'),
        COALESCE(NULLIF(TRIM(t.shift->>'start_time'), ''), '09:00'),
        COALESCE(NULLIF(TRIM(t.shift->>'end_time'), ''), '18:00'),
        COALESCE((t.shift->>'break_minutes')::integer, 0),
        (t.ord_idx - 1)::int
      FROM "organization_settings" os
      CROSS JOIN LATERAL jsonb_array_elements(os."value") WITH ORDINALITY AS t(shift, ord_idx)
      WHERE os."key" = 'attendance.shifts'
        AND jsonb_typeof(os."value") = 'array'
        AND jsonb_array_length(os."value") > 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_work_shifts_organizationId_sortOrder"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_shifts"`);
  }
}
