import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  CalendarHolidayType,
  OrganizationCalendarHoliday,
} from './entities/organization-calendar-holiday.entity';
import {
  OrganizationCalendar,
  OrganizationCalendarStatus,
} from './entities/organization-calendar.entity';

export interface PublishedHolidayRow {
  id: string;
  organizationId: string;
  locationId?: string | null;
  holidayDate: string;
  name: string;
  holidayType: CalendarHolidayType;
}

/** Civil YYYY-MM-DD for string dates or Date values from DATE columns (UTC midnight). */
function holidayDateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

@Injectable()
export class OrganizationCalendarQueryService {
  appliesToLocation(
    holiday: { locationId?: string | null },
    locationId?: string | null,
  ): boolean {
    return (
      !holiday.locationId || !locationId || holiday.locationId === locationId
    );
  }

  async findPublishedHolidaysForYear(
    dataSource: DataSource | EntityManager,
    params: {
      organizationId: string;
      year: number;
      locationId?: string | null;
    },
  ): Promise<PublishedHolidayRow[]> {
    const { organizationId, year, locationId } = params;
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const rows = await dataSource
      .getRepository(OrganizationCalendarHoliday)
      .createQueryBuilder('h')
      .innerJoin(
        OrganizationCalendar,
        'c',
        'c.id = h.calendarId AND c.deletedAt IS NULL',
      )
      .where('h.organizationId = :organizationId', { organizationId })
      .andWhere('c.calendarYear = :year', { year })
      .andWhere('c.status = :status', {
        status: OrganizationCalendarStatus.PUBLISHED,
      })
      .andWhere('h.holidayDate >= :start', { start })
      .andWhere('h.holidayDate <= :end', { end })
      .andWhere('h.deletedAt IS NULL')
      .orderBy('h.holidayDate', 'ASC')
      .getMany();

    return rows
      .filter((h) => this.appliesToLocation(h, locationId))
      .map((h) => ({
        id: h.id,
        organizationId: h.organizationId,
        locationId: h.locationId,
        holidayDate: holidayDateKey(h.holidayDate as string | Date),
        name: h.name,
        holidayType: h.holidayType,
      }));
  }

  async findPublishedHolidaysInRange(
    dataSource: DataSource | EntityManager,
    params: {
      organizationId: string;
      fromDate: string;
      toDate: string;
      locationId?: string | null;
    },
  ): Promise<PublishedHolidayRow[]> {
    const { organizationId, fromDate, toDate, locationId } = params;

    const rows = await dataSource
      .getRepository(OrganizationCalendarHoliday)
      .createQueryBuilder('h')
      .innerJoin(
        OrganizationCalendar,
        'c',
        'c.id = h.calendarId AND c.deletedAt IS NULL',
      )
      .where('h.organizationId = :organizationId', { organizationId })
      .andWhere('c.status = :status', {
        status: OrganizationCalendarStatus.PUBLISHED,
      })
      .andWhere('h.holidayDate >= :fromDate', { fromDate })
      .andWhere('h.holidayDate <= :toDate', { toDate })
      .andWhere('h.deletedAt IS NULL')
      .orderBy('h.holidayDate', 'ASC')
      .getMany();

    return rows
      .filter((h) => this.appliesToLocation(h, locationId))
      .map((h) => ({
        id: h.id,
        organizationId: h.organizationId,
        locationId: h.locationId,
        holidayDate: holidayDateKey(h.holidayDate as string | Date),
        name: h.name,
        holidayType: h.holidayType,
      }));
  }

  holidayDateSet(holidays: PublishedHolidayRow[]): Set<string> {
    return new Set(holidays.map((h) => h.holidayDate));
  }
}
