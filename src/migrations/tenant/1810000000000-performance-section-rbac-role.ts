import { MigrationInterface, QueryRunner } from 'typeorm';

export class PerformanceSectionRbacRole1810000000000
  implements MigrationInterface
{
  name = 'PerformanceSectionRbacRole1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "performance_sections"
      ALTER COLUMN "role" TYPE varchar(64)
    `);

    await queryRunner.query(`
      UPDATE "performance_sections"
      SET "role" = 'HR_ADMIN'
      WHERE "role" = 'HR'
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_answers"
      ALTER COLUMN "filledByRole" TYPE varchar(64)
    `);

    await queryRunner.query(`
      UPDATE "performance_answers"
      SET "filledByRole" = 'HR_ADMIN'
      WHERE "filledByRole" = 'HR'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "performance_sections"
      SET "role" = 'HR'
      WHERE "role" = 'HR_ADMIN'
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_sections"
      ALTER COLUMN "role" TYPE varchar(16)
    `);

    await queryRunner.query(`
      UPDATE "performance_answers"
      SET "filledByRole" = 'HR'
      WHERE "filledByRole" = 'HR_ADMIN'
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_answers"
      ALTER COLUMN "filledByRole" TYPE varchar(16)
    `);
  }
}
