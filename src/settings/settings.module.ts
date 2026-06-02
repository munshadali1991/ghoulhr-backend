import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { OrganizationCalendarController } from './organization-calendar.controller';
import { OrganizationCalendarService } from './organization-calendar.service';
import { OrganizationCalendarQueryService } from './organization-calendar-query.service';

@Module({
  controllers: [SettingsController, OrganizationCalendarController],
  providers: [
    SettingsService,
    OrganizationCalendarService,
    OrganizationCalendarQueryService,
  ],
  exports: [
    SettingsService,
    OrganizationCalendarService,
    OrganizationCalendarQueryService,
  ],
})
export class SettingsModule {}
