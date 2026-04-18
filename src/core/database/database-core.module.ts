import { Module } from '@nestjs/common';
import { TenantConnectionManager } from './tenant-connection.manager';
import { MigrationRunnerService } from './migration-runner.service';

@Module({
  providers: [TenantConnectionManager, MigrationRunnerService],
  exports: [TenantConnectionManager, MigrationRunnerService],
})
export class DatabaseCoreModule {}
