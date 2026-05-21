import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces legacy `work_shifts` (embedded address) with `work_shift_configurations`
 * keyed by `locationId` → `locations_configurations`. Multiple shifts per branch are allowed.
 */
export class WorkShiftConfigurations1779000000000
  implements MigrationInterface
{
  name = 'WorkShiftConfigurations1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "work_shifts" CASCADE`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "work_shift_configurations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid,
        "locationId" uuid NOT NULL,
        "name" character varying(191) NOT NULL,
        "startTime" character varying(5) NOT NULL,
        "endTime" character varying(5) NOT NULL,
        "breakMinutes" integer NOT NULL DEFAULT 0,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_work_shift_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_work_shift_configurations_location"
          FOREIGN KEY ("locationId") REFERENCES "locations_configurations"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_work_shift_configurations_org_sort"
      ON "work_shift_configurations" ("organizationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_work_shift_configurations_locationId"
      ON "work_shift_configurations" ("locationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_work_shift_configurations_locationId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_work_shift_configurations_org_sort"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "work_shift_configurations"`);
    // Intentionally does not recreate `work_shifts`; forward-only for this path.
  }
}
