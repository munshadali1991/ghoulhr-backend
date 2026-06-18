import { MigrationInterface, QueryRunner } from 'typeorm';

export class RbacAccessScope1801000000000 implements MigrationInterface {
  name = 'RbacAccessScope1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "rbac_role_permissions"
      ADD COLUMN IF NOT EXISTS "accessScope" character varying(32) NOT NULL DEFAULT 'SELF'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rbac_role_permissions_accessScope"
      ON "rbac_role_permissions" ("accessScope")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_rbac_role_permissions_accessScope"
    `);
    await queryRunner.query(`
      ALTER TABLE "rbac_role_permissions"
      DROP COLUMN IF EXISTS "accessScope"
    `);
  }
}
