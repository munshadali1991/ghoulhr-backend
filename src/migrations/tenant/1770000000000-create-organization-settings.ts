import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationSettings1770000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(255) NOT NULL UNIQUE,
        value JSONB NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "deletedAt" TIMESTAMP WITH TIME ZONE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_settings_key ON organization_settings(key)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_org_settings_key`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_settings`);
  }
}
