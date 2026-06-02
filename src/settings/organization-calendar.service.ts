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
