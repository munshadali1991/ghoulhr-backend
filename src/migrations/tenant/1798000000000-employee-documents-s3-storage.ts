import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeDocumentsS3Storage1798000000000
  implements MigrationInterface
{
  name = 'EmployeeDocumentsS3Storage1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      ADD COLUMN IF NOT EXISTS "storageKey" character varying(1024)
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "profilePhotoStorageKey" character varying(1024)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_documents"
      DROP COLUMN IF EXISTS "storageKey"
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      DROP COLUMN IF EXISTS "profilePhotoStorageKey"
    `);
  }
}
