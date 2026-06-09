import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkShiftSessions1796000000000 implements MigrationInterface {
  name = 'WorkShiftSessions1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "work_shift_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "shiftConfigurationId" uuid NOT NULL,
        "sessionLabel" character varying(64) NOT NULL,
        "startTime" character varying(5) NOT NULL,
        "endTime" character varying(5) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_work_shift_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_work_shift_sessions_shift"
          FOREIGN KEY ("shiftConfigurationId") REFERENCES "work_shift_configurations"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_work_shift_sessions_shift"
      ON "work_shift_sessions" ("shiftConfigurationId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_work_shift_sessions_shift"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_shift_sessions"`);
  }
}
