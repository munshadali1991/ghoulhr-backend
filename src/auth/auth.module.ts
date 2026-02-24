import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthTokenGuard } from './guards/auth-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';

@Global()
@Module({
  imports: [UsersModule, OrganizationsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenGuard, RolesGuard, SuperAdminBootstrapService],
  exports: [AuthService, AuthTokenGuard, RolesGuard],
})
export class AuthModule {}
