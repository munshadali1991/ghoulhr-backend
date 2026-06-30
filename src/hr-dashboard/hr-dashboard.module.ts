import { Module } from '@nestjs/common';
import { HrDashboardController } from './hr-dashboard.controller';
import { HrDashboardService } from './hr-dashboard.service';

@Module({
  controllers: [HrDashboardController],
  providers: [HrDashboardService],
})
export class HrDashboardModule {}
