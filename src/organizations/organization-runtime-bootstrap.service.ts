import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

@Injectable()
export class OrganizationRuntimeBootstrapService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    OrganizationRuntimeBootstrapService.name,
  );

  constructor(private readonly organizationsService: OrganizationsService) {}

  async onApplicationBootstrap() {
    try {
      await this.organizationsService.ensureAllOrganizationsRuntimeReady();
    } catch (error) {
      this.logger.error(
        'Failed to bootstrap organization runtime during startup',
        error as Error,
      );
    }
  }
}
