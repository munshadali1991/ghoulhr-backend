import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixOrganizationSettingsTimestamps1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename columns from snake_case to camelCase to match BaseEntity and other migrations
    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN created_at TO "createdAt"
    `);
    
    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN updated_at TO "updatedAt"
    `);
    
    await queryRunner.query(`
      ALTER TABLE organization_settings 
      RENAME COLUMN deleted_at TO "deletedAt"
    `);
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
