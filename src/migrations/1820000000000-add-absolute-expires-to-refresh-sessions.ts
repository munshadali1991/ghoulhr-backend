import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAbsoluteExpiresToRefreshSessions1820000000000
  implements MigrationInterface
{
  name = 'AddAbsoluteExpiresToRefreshSessions1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_sessions"
      ADD COLUMN "absoluteExpiresAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "refresh_sessions"
      SET "absoluteExpiresAt" = LEAST("expiresAt", "createdAt" + INTERVAL '24 hours')
      WHERE "absoluteExpiresAt" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_sessions"
      ALTER COLUMN "absoluteExpiresAt" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_sessions"
      DROP COLUMN "absoluteExpiresAt"
    `);
  }
}
