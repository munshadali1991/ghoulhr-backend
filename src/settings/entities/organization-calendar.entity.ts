import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { OrganizationCalendarHoliday } from './organization-calendar-holiday.entity';

export enum OrganizationCalendarStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

@Entity({ name: 'organization_calendars' })
@Index(['organizationId'])
export class OrganizationCalendar extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'smallint' })
  calendarYear: number;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 16, default: OrganizationCalendarStatus.PUBLISHED })
  status: OrganizationCalendarStatus;

  @OneToMany(() => OrganizationCalendarHoliday, (h) => h.calendar)
  holidays?: OrganizationCalendarHoliday[];
}
