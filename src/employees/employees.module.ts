import { Module, forwardRef } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { ReportingManagersService } from './reporting-managers.service';
import { EmployeesController } from './employees.controller';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../common/services/password.service';
import { FieldEncryptionService } from '../common/services/field-encryption.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => AuthModule), SettingsModule],
  controllers: [EmployeesController],
  providers: [
    EmployeesService,
    ReportingManagersService,
    PasswordService,
    FieldEncryptionService,
  ],
  exports: [EmployeesService, ReportingManagersService],
})
export class EmployeesModule {}
