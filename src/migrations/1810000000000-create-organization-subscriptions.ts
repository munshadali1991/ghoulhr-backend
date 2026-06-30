import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationSubscriptions1810000000000
  implements MigrationInterface
{
  name = 'CreateOrganizationSubscriptions1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "organization_subscriptions_subscriptiontype_enum" AS ENUM(
        'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "organization_subscriptions_status_enum" AS ENUM(
        'ACTIVE', 'EXPIRED', 'SUPERSEDED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "organization_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "subscriptionType" "organization_subscriptions_subscriptiontype_enum" NOT NULL,
        "startsAt" TIMESTAMPTZ NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "status" "organization_subscriptions_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "createdByUserId" uuid,
        "notes" text,
        CONSTRAINT "PK_organization_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_organization_subscriptions_org" FOREIGN KEY ("organizationId")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_organization_subscriptions_org"
      ON "organization_subscriptions" ("organizationId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_organization_subscriptions_active_org"
      ON "organization_subscriptions" ("organizationId")
      WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_organization_subscriptions_active_org"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_organization_subscriptions_org"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_subscriptions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "organization_subscriptions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "organization_subscriptions_subscriptiontype_enum"`,
    );
  }
}
