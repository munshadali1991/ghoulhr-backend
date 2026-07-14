import { BadRequestException } from '@nestjs/common';
import { OrganizationCalendarService } from './organization-calendar.service';
import { CalendarHolidayType } from './entities/organization-calendar-holiday.entity';
import { OrganizationCalendarStatus } from './entities/organization-calendar.entity';

type HolidayRow = {
  id: string;
  organizationId: string;
  calendarId: string;
  locationId: string | null;
  holidayDate: string;
  name: string;
  holidayType: CalendarHolidayType;
};

function createMockDataSource(seed?: { holidays?: HolidayRow[] }) {
  const organizationId = 'org-1';
  const calendar = {
    id: 'cal-1',
    organizationId,
    calendarYear: 2026,
    name: '2026 Official Calendar',
    status: OrganizationCalendarStatus.DRAFT,
  };
  let holidays: HolidayRow[] = [...(seed?.holidays ?? [])];
  let idSeq = 100;

  const holidayRepo = {
    find: jest.fn(async () => [...holidays]),
    create: jest.fn((data: Partial<HolidayRow>) => ({
      id: `new-${++idSeq}`,
      ...data,
    })),
    save: jest.fn(async (row: HolidayRow) => {
      const idx = holidays.findIndex((h) => h.id === row.id);
      if (idx >= 0) holidays[idx] = row;
      else holidays.push(row);
      return row;
    }),
  };

  const calendarRepo = {
    findOne: jest.fn(async () => calendar),
    create: jest.fn((data: object) => data),
    save: jest.fn(async (row: typeof calendar) => row),
  };

  const locationRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };

  const resolveRepo = (entity: { name?: string }) => {
    switch (entity?.name) {
      case 'OrganizationCalendarHoliday':
        return holidayRepo;
      case 'OrganizationCalendar':
        return calendarRepo;
      case 'LocationConfiguration':
        return locationRepo;
      default:
        throw new Error(`Unexpected repository: ${entity?.name}`);
    }
  };

  const manager = {
    getRepository: resolveRepo,
  };

  const dataSource = {
    getRepository: resolveRepo,
    transaction: async (fn: (m: typeof manager) => Promise<unknown>) =>
      fn(manager),
  };

  return { dataSource, organizationId, holidayRepo, getHolidays: () => holidays };
}

describe('OrganizationCalendarService.bulkUpsertHolidays', () => {
  const service = new OrganizationCalendarService();

  it('creates new holidays and overwrites by date+location', async () => {
    const { dataSource, organizationId } = createMockDataSource({
      holidays: [
        {
          id: 'h1',
          organizationId: 'org-1',
          calendarId: 'cal-1',
          locationId: null,
          holidayDate: '2026-01-26',
          name: 'Old Republic Day',
          holidayType: CalendarHolidayType.GENERAL,
        },
      ],
    });

    const result = await service.bulkUpsertHolidays(
      dataSource as never,
      organizationId,
      {
        year: 2026,
        holidays: [
          {
            holidayDate: '2026-01-26',
            name: 'Republic Day',
            holidayType: CalendarHolidayType.GENERAL,
            locationId: null,
          },
          {
            holidayDate: '2026-08-15',
            name: 'Independence Day',
            holidayType: CalendarHolidayType.GENERAL,
          },
        ],
      },
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.overwrites[0].previousName).toBe('Old Republic Day');
    expect(result.overwrites[0].name).toBe('Republic Day');
  });

  it('rejects holidays outside the calendar year without writing', async () => {
    const { dataSource, organizationId, holidayRepo } = createMockDataSource();

    await expect(
      service.bulkUpsertHolidays(dataSource as never, organizationId, {
        year: 2026,
        holidays: [
          {
            holidayDate: '2025-01-01',
            name: 'Wrong year',
            holidayType: CalendarHolidayType.GENERAL,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(holidayRepo.save).not.toHaveBeenCalled();
  });

  it('rejects empty payload', async () => {
    const { dataSource, organizationId } = createMockDataSource();
    await expect(
      service.bulkUpsertHolidays(dataSource as never, organizationId, {
        year: 2026,
        holidays: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more than 500 holidays', async () => {
    const { dataSource, organizationId } = createMockDataSource();
    const holidays = Array.from({ length: 501 }, (_, i) => ({
      holidayDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      name: `Holiday ${i}`,
      holidayType: CalendarHolidayType.GENERAL,
    }));

    await expect(
      service.bulkUpsertHolidays(dataSource as never, organizationId, {
        year: 2026,
        holidays,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
