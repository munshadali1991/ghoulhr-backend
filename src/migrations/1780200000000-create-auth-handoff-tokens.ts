import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthHandoffTokens1780200000000 implements MigrationInterface {
  name = 'CreateAuthHandoffTokens1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_handoff_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tokenHash" character varying NOT NULL,
        "refreshSessionId" uuid NOT NULL,
        "targetSubdomain" character varying(128) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_handoff_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_handoff_tokens_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_auth_handoff_tokens_refreshSession" FOREIGN KEY ("refreshSessionId") REFERENCES "refresh_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_handoff_tokens"`);
  }
}
