import { Injectable, Logger } from '@nestjs/common';
import { DataSource, MigrationExecutor } from 'typeorm';
import { join } from 'path';

@Injectable()
export class MigrationRunnerService {
  private readonly logger = new Logger(MigrationRunnerService.name);

  /**
   * Run all pending migrations on a tenant database
   */
  async runMigrations(dataSource: DataSource): Promise<void> {
    try {
      this.logger.log(
        `Running migrations on database: ${dataSource.options.database}`,
      );

      // Use TypeORM's built-in migration runner
      await dataSource.runMigrations();

      this.logger.log('All migrations completed successfully');
    } catch (error) {
      this.logger.error(`Migration failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Revert last migration
   */
  async revertLastMigration(dataSource: DataSource): Promise<void> {
    try {
      this.logger.log(
        `Reverting last migration on database: ${dataSource.options.database}`,
      );

      await dataSource.undoLastMigration();

      this.logger.log('Last migration reverted successfully');
    } catch (error) {
      this.logger.error(
        `Migration revert failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async showMigrationStatus(dataSource: DataSource): Promise<void> {
    try {
      const migrations = await dataSource.showMigrations();
      this.logger.log(
        `Migrations status: ${migrations ? 'Pending' : 'All up to date'}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get migration status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
