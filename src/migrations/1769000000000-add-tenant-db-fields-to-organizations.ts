import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantDbFieldsToOrganizations1769000000000
  implements MigrationInterface
{
  name = 'AddTenantDbFieldsToOrganizations1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dbName column
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "dbName" character varying`,
    );

    // Add dbHost column
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "dbHost" character varying`,
    );

    // Add dbUser column
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "dbUser" character varying`,
    );

    // Add dbPassword column
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "dbPassword" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove dbPassword column
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "dbPassword"`,
    );

    // Remove dbUser column
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "dbUser"`);

    // Remove dbHost column
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "dbHost"`);

    // Remove dbName column
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "dbName"`);
  }
}
