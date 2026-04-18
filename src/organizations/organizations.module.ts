import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './organization.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../modules/email';
import { DatabaseCoreModule } from '../core/database/database-core.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User]),
    UsersModule,
    EmailModule,
    DatabaseCoreModule,
    EmployeesModule,
  ],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
