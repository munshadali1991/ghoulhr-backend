import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationHolidays1785000000000 implements MigrationInterface {
  name = 'OrganizationHolidays1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      CREATE INDEX IF NOT EXISTS "IDX_org_holidays_org_date"
      ON "organization_holidays" ("organizationId", "holidayDate")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_org_holidays_org_loc_date_name"
      ON "organization_holidays" (
        "organizationId",
        COALESCE("locationId", '00000000-0000-0000-0000-000000000000'::uuid),
        "holidayDate",
        "name"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_org_holidays_org_loc_date_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_org_holidays_org_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_holidays"`);
  }
}
