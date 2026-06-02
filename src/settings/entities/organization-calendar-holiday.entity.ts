import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { OrganizationCalendar } from './organization-calendar.entity';

export enum CalendarHolidayType {
  GENERAL = 'GENERAL',
  RESTRICTED = 'RESTRICTED',
}

@Entity({ name: 'organization_calendar_holidays' })
@Index(['organizationId', 'holidayDate'])
@Index(['calendarId'])
export class OrganizationCalendarHoliday extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  calendarId: string;

  @ManyToOne(() => OrganizationCalendar, (c) => c.holidays, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'calendarId' })
  calendar?: OrganizationCalendar;

  @Column({ type: 'uuid', nullable: true })
  locationId?: string | null;

  @Column({ type: 'date' })
  holidayDate: string;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 32, default: CalendarHolidayType.GENERAL })
  holidayType: CalendarHolidayType;
}
