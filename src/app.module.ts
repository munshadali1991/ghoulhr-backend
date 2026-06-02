import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DatabaseModule } from './database/database.module';
import databaseConfig from './database/database.config';

import { OrganizationsModule } from './organizations/organizations.module';
import { TenantResolverMiddleware } from './common/middleware/tenant-resolver.middleware';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DatabaseCoreModule } from './core/database/database-core.module';
import { EmployeesModule } from './employees/employees.module';
import { SettingsModule } from './settings/settings.module';
import { EssModule } from './ess/ess.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? `${process.cwd()}/.env.production`
          : `${process.cwd()}/.env`,
    }),
    DatabaseModule,
    DatabaseCoreModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    EmployeesModule,
    SettingsModule,
    EssModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolverMiddleware).forRoutes('*'); // apply globally
  }
}
