import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class SuperAdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperAdminBootstrapService.name);

  constructor(private readonly authService: AuthService) {}

  async onApplicationBootstrap() {
    try {
      await this.authService.ensureDefaultSuperAdmin();
    } catch (error) {
      this.logger.error('Failed to ensure default SUPER_ADMIN during bootstrap', error as Error);
    }
  }
}
