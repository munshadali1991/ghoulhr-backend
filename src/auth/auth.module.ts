import { Global, Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TenantAuthController } from './tenant-auth.controller';
import { TenantAuthService } from './tenant-auth.service';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthTokenGuard } from './guards/auth-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { EmployeesModule } from '../employees/employees.module';
import { PasswordService } from '../common/services/password.service';
import { DatabaseCoreModule } from '../core/database/database-core.module';
import { RefreshSession } from './entities/refresh-session.entity';
import { AuthHandoffToken } from './entities/auth-handoff-token.entity';
import { RefreshSessionService } from './refresh-session.service';
import { AuthCookieService } from './auth-cookie.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';
import { AuthActorService } from './auth-actor.service';
import { AuthHandoffService } from './auth-handoff.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EmailModule } from '../modules/email';
import { MustChangePasswordGuard } from './guards/must-change-password.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshSession, AuthHandoffToken]),
    UsersModule,
    forwardRef(() => OrganizationsModule),
    SubscriptionsModule,
    forwardRef(() => EmployeesModule),
    DatabaseCoreModule,
    EmailModule,
  ],
  controllers: [AuthController, TenantAuthController],
  providers: [
    AuthService,
    TenantAuthService,
    AuthTokenGuard,
    RolesGuard,
    SuperAdminBootstrapService,
    PasswordService,
    RefreshSessionService,
    AuthCookieService,
    AuthRefreshService,
    AuthSessionService,
    AuthActorService,
    AuthHandoffService,
    MustChangePasswordGuard,
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
  ],
  exports: [
    AuthService,
    TenantAuthService,
    AuthTokenGuard,
    RolesGuard,
    AuthCookieService,
    AuthSessionService,
    AuthActorService,
  ],
})
export class AuthModule {}
