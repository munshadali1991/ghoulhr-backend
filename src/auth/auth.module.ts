import { Global, Module, forwardRef } from '@nestjs/common';
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
import { RefreshSessionService } from './refresh-session.service';
import { AuthCookieService } from './auth-cookie.service';
import { AuthRefreshService } from './auth-refresh.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshSession]),
    UsersModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => EmployeesModule),
    DatabaseCoreModule,
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
  ],
  exports: [
    AuthService,
    TenantAuthService,
    AuthTokenGuard,
    RolesGuard,
    AuthCookieService,
  ],
})
export class AuthModule {}
