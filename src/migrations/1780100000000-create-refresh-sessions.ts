import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshSessions1780100000000 implements MigrationInterface {
  name = 'CreateRefreshSessions1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tokenHash" character varying NOT NULL,
        "sessionKind" character varying(16) NOT NULL,
        "masterUserId" uuid,
        "employeeId" uuid,
        "organizationId" uuid,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "replacedBySessionId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_sessions_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_refresh_sessions_masterUser" FOREIGN KEY ("masterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_refresh_sessions_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
  }
}
