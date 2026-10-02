import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './organization.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { DatabaseCoreModule } from '../core/database/database-core.module';
import { EmployeesModule } from '../employees/employees.module';
import { OrganizationRuntimeBootstrapService } from './organization-runtime-bootstrap.service';
import { TenantSslProvisioningService } from './tenant-ssl-provisioning.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PasswordService } from '../common/services/password.service';
import { EmailModule } from '../modules/email';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User]),
    UsersModule,
    DatabaseCoreModule,
    EmployeesModule,
    forwardRef(() => SubscriptionsModule),
    EmailModule,
  ],
  providers: [
    OrganizationsService,
    OrganizationRuntimeBootstrapService,
    TenantSslProvisioningService,
    PasswordService,
  ],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
