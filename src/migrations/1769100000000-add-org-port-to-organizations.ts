import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgPortToOrganizations1769100000000
  implements MigrationInterface
{
  name = 'AddOrgPortToOrganizations1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "org_port" integer`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organizations_org_port" ON "organizations" ("org_port")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_organizations_org_port"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN IF EXISTS "org_port"`,
    );
  }
}
