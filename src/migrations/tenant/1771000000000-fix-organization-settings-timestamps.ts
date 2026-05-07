import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixOrganizationSettingsTimestamps1771000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if snake_case columns exist before renaming
    const columnsResult = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organization_settings' 
      AND column_name IN ('created_at', 'updated_at', 'deleted_at')
    `);

    const existingColumns = columnsResult.map((row: any) => row.column_name);

    // Rename columns from snake_case to camelCase to match BaseEntity and other migrations
    if (existingColumns.includes('created_at')) {
      await queryRunner.query(`
        ALTER TABLE organization_settings 
        RENAME COLUMN created_at TO "createdAt"
      `);
    }

    if (existingColumns.includes('updated_at')) {
      await queryRunner.query(`
        ALTER TABLE organization_settings 
        RENAME COLUMN updated_at TO "updatedAt"
      `);
    }

    if (existingColumns.includes('deleted_at')) {
      await queryRunner.query(`
        ALTER TABLE organization_settings 
        RENAME COLUMN deleted_at TO "deletedAt"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to snake_case
    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN "createdAt" TO created_at
    `);

    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN "updatedAt" TO updated_at
    `);

    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN "deletedAt" TO deleted_at
    `);
  }
}
