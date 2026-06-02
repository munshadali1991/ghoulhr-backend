import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow re-creating a soft-deleted holiday on the same calendar/date/name.
 */
export class CalendarHolidayPartialUnique1792000000000
  implements MigrationInterface
{
  name = 'CalendarHolidayPartialUnique1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_calendar_holidays_cal_loc_date_name"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_calendar_holidays_cal_loc_date_name"
      ON "organization_calendar_holidays" (
        "calendarId",
        COALESCE("locationId", '00000000-0000-0000-0000-000000000000'::uuid),
        "holidayDate",
        "name"
      )
      WHERE "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_calendar_holidays_cal_loc_date_name"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_calendar_holidays_cal_loc_date_name"
      ON "organization_calendar_holidays" (
        "calendarId",
        COALESCE("locationId", '00000000-0000-0000-0000-000000000000'::uuid),
        "holidayDate",
        "name"
      )
    `);
  }
}
