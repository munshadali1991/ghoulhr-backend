import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationIdToTenantNormalized1776000000002
  implements MigrationInterface
{
  name = 'AddOrganizationIdToTenantNormalized1776000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employees_organizationId"
      ON "employees" ("organizationId")
    `);

    await queryRunner.query(`
      ALTER TABLE "departments"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_departments_organizationId"
      ON "departments" ("organizationId")
    `);

    await queryRunner.query(`
      ALTER TABLE "designations"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_designations_organizationId"
      ON "designations" ("organizationId")
    `);

    await queryRunner.query(`
      ALTER TABLE "designation_departments"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_designation_departments_organizationId"
      ON "designation_departments" ("organizationId")
    `);

    await queryRunner.query(`
      ALTER TABLE "settings_catalog"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_settings_catalog_organizationId"
      ON "settings_catalog" ("organizationId")
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
      ADD COLUMN IF NOT EXISTS "organizationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tenant_settings_organizationId"
      ON "tenant_settings" ("organizationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenant_settings_organizationId"`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "organizationId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_settings_catalog_organizationId"`);
    await queryRunner.query(`ALTER TABLE "settings_catalog" DROP COLUMN IF EXISTS "organizationId"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_designation_departments_organizationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "designation_departments" DROP COLUMN IF EXISTS "organizationId"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_designations_organizationId"`);
    await queryRunner.query(`ALTER TABLE "designations" DROP COLUMN IF EXISTS "organizationId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_departments_organizationId"`);
    await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN IF EXISTS "organizationId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_employees_organizationId"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN IF EXISTS "organizationId"`);
  }
}
