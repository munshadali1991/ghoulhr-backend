import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Master leave types per organization and branch (`locations_configurations`).
 */
export class LeaveConfigurations1780000000000 implements MigrationInterface {
  name = 'LeaveConfigurations1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_configurations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid,
        "locationId" uuid NOT NULL,
        "name" character varying(191) NOT NULL,
        "code" character varying(32),
        "leaveCategory" character varying(64),
        "isPaid" boolean NOT NULL DEFAULT true,
        "annualEntitlementDays" numeric(6,2) NOT NULL DEFAULT 0,
        "allowCarryForward" boolean NOT NULL DEFAULT false,
        "maxCarryForwardDays" numeric(6,2),
        "requiresApproval" boolean NOT NULL DEFAULT true,
        "requiresSupportingDocument" boolean NOT NULL DEFAULT false,
        "allowHalfDay" boolean NOT NULL DEFAULT true,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_leave_configurations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_leave_configurations_location"
          FOREIGN KEY ("locationId") REFERENCES "locations_configurations"("id")
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_configurations_org_location_sort"
      ON "leave_configurations" ("organizationId", "locationId", "sortOrder")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_configurations_locationId"
      ON "leave_configurations" ("locationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_configurations_locationId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_configurations_org_location_sort"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_configurations"`);
  }
}
