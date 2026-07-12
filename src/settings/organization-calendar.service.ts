import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { LocationConfiguration } from '../employees/entities/location-configuration.entity';
import {
  CalendarHolidayType,
  OrganizationCalendarHoliday,
} from './entities/organization-calendar-holiday.entity';
import {
  OrganizationCalendar,
  OrganizationCalendarStatus,
} from './entities/organization-calendar.entity';
import {
  BulkUpsertCalendarHolidaysDto,
  CreateCalendarHolidayDto,
  UpdateCalendarHolidayDto,
} from './dto/organization-calendar.dto';

@Injectable()
export class OrganizationCalendarService {
  async getCalendarForYear(
    dataSource: DataSource,
    organizationId: string,
    year: number,
  ) {
    const calendar = await this.getOrCreateCalendar(
      dataSource,
      organizationId,
      year,
    );

    const holidays = await dataSource
      .getRepository(OrganizationCalendarHoliday)
      .find({
        where: { calendarId: calendar.id, organizationId },
        order: { holidayDate: 'ASC' },
      });

    const locationIds = [
      ...new Set(holidays.map((h) => h.locationId).filter(Boolean)),
    ] as string[];

    const locationNames = new Map<string, string>();
    if (locationIds.length > 0) {
      const locations = await dataSource
        .getRepository(LocationConfiguration)
        .find({
          where: { id: In(locationIds), organizationId },
        });
      for (const loc of locations) {
        if (loc.id && loc.name) {
          locationNames.set(loc.id, loc.name);
        }
      }
    }

    return {
      calendar: {
        id: calendar.id,
        calendarYear: calendar.calendarYear,
        name: calendar.name,
        status: calendar.status,
      },
      holidays: holidays.map((h) => this.mapHolidayToApi(h, locationNames)),
    };
  }

  async createHoliday(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateCalendarHolidayDto,
  ) {
    await this.assertLocationExists(dataSource, organizationId, dto.locationId);

    const holidayYear = new Date(dto.holidayDate).getFullYear();
    if (holidayYear !== dto.year) {
      throw new BadRequestException(
        'Holiday date must fall within the selected calendar year',
      );
    }

    const calendar = await this.getOrCreateCalendar(
      dataSource,
      organizationId,
      dto.year,
    );

    const repo = dataSource.getRepository(OrganizationCalendarHoliday);
    const saved = await repo.save(
      repo.create({
        organizationId,
        calendarId: calendar.id,
        locationId: dto.locationId ?? null,
        holidayDate: dto.holidayDate,
        name: dto.name.trim(),
        holidayType: dto.holidayType,
      }),
    );

    return this.mapHolidayToApi(saved, new Map());
  }

  async updateHoliday(
    dataSource: DataSource,
    organizationId: string,
    holidayId: string,
    dto: UpdateCalendarHolidayDto,
  ) {
    const repo = dataSource.getRepository(OrganizationCalendarHoliday);
    const row = await repo.findOne({
      where: { id: holidayId, organizationId },
      relations: ['calendar'],
    });

    if (!row) {
      throw new NotFoundException('Holiday not found');
    }

    if (dto.locationId !== undefined) {
      await this.assertLocationExists(
        dataSource,
        organizationId,
        dto.locationId ?? undefined,
      );
      row.locationId = dto.locationId;
    }

    if (dto.holidayDate !== undefined) {
      const y = new Date(dto.holidayDate).getFullYear();
      if (y !== row.calendar?.calendarYear) {
        throw new BadRequestException(
          'Holiday date must stay within the calendar year',
        );
      }
      row.holidayDate = dto.holidayDate;
    }

    if (dto.name !== undefined) {
      row.name = dto.name.trim();
    }

    if (dto.holidayType !== undefined) {
      row.holidayType = dto.holidayType;
    }

    const saved = await repo.save(row);
    return this.mapHolidayToApi(saved, new Map());
  }

  async deleteHoliday(
    dataSource: DataSource,
    organizationId: string,
    holidayId: string,
  ) {
    const repo = dataSource.getRepository(OrganizationCalendarHoliday);
    const row = await repo.findOne({
      where: { id: holidayId, organizationId },
    });

    if (!row) {
      throw new NotFoundException('Holiday not found');
    }

    await repo.softRemove(row);
    return { success: true };
  }

  async publishCalendar(
    dataSource: DataSource,
    organizationId: string,
    year: number,
  ) {
    const calendar = await this.getOrCreateCalendar(
      dataSource,
      organizationId,
      year,
    );
    calendar.status = OrganizationCalendarStatus.PUBLISHED;
    await dataSource.getRepository(OrganizationCalendar).save(calendar);
    return {
      message: 'Calendar published successfully',
      calendar: {
        id: calendar.id,
        calendarYear: calendar.calendarYear,
        status: calendar.status,
      },
    };
  }

  async bulkUpsertHolidays(
    dataSource: DataSource,
    organizationId: string,
    dto: BulkUpsertCalendarHolidaysDto,
  ) {
    if (!dto.holidays?.length) {
      throw new BadRequestException('At least one holiday is required');
    }
    if (dto.holidays.length > 500) {
      throw new BadRequestException('A maximum of 500 holidays can be imported at once');
    }

    const rowErrors: Array<{ index: number; message: string }> = [];
    const locationIds = [
      ...new Set(
        dto.holidays
          .map((h) => h.locationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (locationIds.length > 0) {
      const locations = await dataSource
        .getRepository(LocationConfiguration)
        .find({ where: { id: In(locationIds), organizationId } });
      const found = new Set(locations.map((l) => l.id));
      for (let i = 0; i < dto.holidays.length; i += 1) {
        const locId = dto.holidays[i].locationId;
        if (locId && !found.has(locId)) {
          rowErrors.push({ index: i, message: 'Location not found' });
        }
      }
    }

    /** Last row wins for same date+location within the payload */
    const deduped = new Map<
      string,
      { index: number; item: (typeof dto.holidays)[number] }
    >();

    for (let i = 0; i < dto.holidays.length; i += 1) {
      const item = dto.holidays[i];
      const holidayDate = this.normalizeDateString(item.holidayDate);
      if (!holidayDate) {
        rowErrors.push({ index: i, message: 'Invalid holiday date' });
        continue;
      }
      const holidayYear = Number(holidayDate.slice(0, 4));
      if (holidayYear !== dto.year) {
        rowErrors.push({
          index: i,
          message: 'Holiday date must fall within the selected calendar year',
        });
        continue;
      }
      const name = item.name?.trim();
      if (!name) {
        rowErrors.push({ index: i, message: 'Holiday name is required' });
        continue;
      }
      if (name.length > 191) {
        rowErrors.push({
          index: i,
          message: 'Holiday name must be at most 191 characters',
        });
        continue;
      }
      if (
        item.holidayType !== CalendarHolidayType.GENERAL &&
        item.holidayType !== CalendarHolidayType.RESTRICTED
      ) {
        rowErrors.push({
          index: i,
          message: 'Holiday type must be GENERAL or RESTRICTED',
        });
        continue;
      }

      const key = this.holidayMatchKey(holidayDate, item.locationId ?? null);
      deduped.set(key, {
        index: i,
        item: {
          ...item,
          holidayDate,
          name,
          locationId: item.locationId ?? null,
        },
      });
    }

    if (rowErrors.length > 0) {
      throw new BadRequestException({
        message: 'Holiday import validation failed',
        errors: rowErrors,
      });
    }

    const calendar = await this.getOrCreateCalendar(
      dataSource,
      organizationId,
      dto.year,
    );

    const result = await dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(OrganizationCalendarHoliday);
      const existing = await repo.find({
        where: { calendarId: calendar.id, organizationId },
      });

      const existingByKey = new Map<string, OrganizationCalendarHoliday>();
      for (const row of existing) {
        const date = this.normalizeDateString(row.holidayDate);
        if (!date) continue;
        existingByKey.set(
          this.holidayMatchKey(date, row.locationId ?? null),
          row,
        );
      }

      let created = 0;
      let updated = 0;
      const overwrites: Array<{
        holidayDate: string;
        name: string;
        previousName: string;
      }> = [];

      for (const { item } of deduped.values()) {
        const key = this.holidayMatchKey(
          item.holidayDate,
          item.locationId ?? null,
        );
        const current = existingByKey.get(key);
        if (current) {
          const previousName = current.name;
          current.name = item.name;
          current.holidayType = item.holidayType;
          current.holidayDate = item.holidayDate;
          current.locationId = item.locationId ?? null;
          await repo.save(current);
          updated += 1;
          overwrites.push({
            holidayDate: item.holidayDate,
            name: item.name,
            previousName,
          });
        } else {
          const saved = await repo.save(
            repo.create({
              organizationId,
              calendarId: calendar.id,
              locationId: item.locationId ?? null,
              holidayDate: item.holidayDate,
              name: item.name,
              holidayType: item.holidayType,
            }),
          );
          existingByKey.set(key, saved);
          created += 1;
        }
      }

      return { created, updated, overwrites };
    });

    return {
      created: result.created,
      updated: result.updated,
      overwrites: result.overwrites,
      message: `Imported ${result.created + result.updated} holidays (${result.created} created, ${result.updated} updated)`,
    };
  }

  private holidayMatchKey(
    holidayDate: string,
    locationId: string | null,
  ): string {
    return `${holidayDate}|${locationId ?? ''}`;
  }

  private normalizeDateString(
    value: string | Date | null | undefined,
  ): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  private async getOrCreateCalendar(
    dataSource: DataSource,
    organizationId: string,
    year: number,
  ): Promise<OrganizationCalendar> {
    const repo = dataSource.getRepository(OrganizationCalendar);
    let calendar = await repo.findOne({
      where: { organizationId, calendarYear: year },
    });

    if (!calendar) {
      calendar = await repo.save(
        repo.create({
          organizationId,
          calendarYear: year,
          name: `${year} Official Calendar`,
          status: OrganizationCalendarStatus.DRAFT,
        }),
      );
    }

    return calendar;
  }

  private async assertLocationExists(
    dataSource: DataSource,
    organizationId: string,
    locationId?: string,
  ) {
    if (!locationId) return;

    const loc = await dataSource.getRepository(LocationConfiguration).findOne({
      where: { id: locationId, organizationId },
    });

    if (!loc) {
      throw new BadRequestException('Location not found');
    }
  }

  private mapHolidayToApi(
    h: OrganizationCalendarHoliday,
    locationNames: Map<string, string>,
  ) {
    const holidayDate =
      typeof h.holidayDate === 'string'
        ? h.holidayDate
        : (h.holidayDate as Date).toISOString().slice(0, 10);

    return {
      id: h.id,
      holidayDate,
      name: h.name,
      holidayType: h.holidayType,
      locationId: h.locationId ?? null,
      locationName: h.locationId
        ? (locationNames.get(h.locationId) ?? null)
        : null,
    };
  }
}
