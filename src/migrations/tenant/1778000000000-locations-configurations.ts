import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocationsConfigurations1778000000000
  implements MigrationInterface
{
  name = 'LocationsConfigurations1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "locations_configurations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid,
        "name" character varying(191) NOT NULL,
        "code" character varying(32),
        "addressLine1" text,
        "city" character varying(120),
        "region" character varying(120),
        "postalCode" character varying(32),
        "country" character varying(120),
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_locations_configurations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_locations_configurations_org_sort"
      ON "locations_configurations" ("organizationId", "sortOrder")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_locations_configurations_org_sort"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "locations_configurations"`);
  }
}
