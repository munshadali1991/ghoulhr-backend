import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Organization } from '../../organizations/organization.entity';
import { RbacRole } from '../../rbac/entities/rbac-role.entity';
import { RbacPermission } from '../../rbac/entities/rbac-permission.entity';
import { RbacRolePermission } from '../../rbac/entities/rbac-role-permission.entity';
import { RbacEmployeeRoleAssignment } from '../../rbac/entities/rbac-employee-role-assignment.entity';
import { RbacPermissionAuditLog } from '../../rbac/entities/rbac-permission-audit-log.entity';

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly connections = new Map<string, DataSource>();
  private readonly lock = new Map<string, Promise<DataSource>>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get or create a DataSource connection for a tenant
   */
  async getOrCreateConnection(org: Organization): Promise<DataSource> {
    const dbName = org.dbName;
    if (!dbName) {
      throw new Error(
        `Organization ${org.id} does not have a tenant database configured`,
      );
    }

    // Return cached connection if exists
    if (this.connections.has(dbName)) {
      return this.connections.get(dbName);
    }

    // Prevent race conditions with locking
    if (this.lock.has(dbName)) {
      await this.lock.get(dbName);
      if (this.connections.has(dbName)) {
        return this.connections.get(dbName);
      }
    }

    // Create connection with lock
    const lockPromise = this.createConnection(org).finally(() => {
      this.lock.delete(dbName);
    });

    this.lock.set(dbName, lockPromise);
    const dataSource = await lockPromise;
    this.connections.set(dbName, dataSource);

    return dataSource;
  }

  /**
   * Create a new PostgreSQL database
   */
  async createDatabase(dbName: string): Promise<void> {
    const masterDataSource = new DataSource({
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST'),
      port: parseInt(this.configService.get<string>('DB_PORT'), 10),
      username: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASS'),
      database: 'postgres', // Connect to default DB to create new one
    });

    try {
      await masterDataSource.initialize();

      // Check if database exists
      const result = await masterDataSource.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbName],
      );

      if (result.length === 0) {
        await masterDataSource.query(`CREATE DATABASE "${dbName}"`);
        this.logger.log(`Tenant database "${dbName}" created successfully`);
      } else {
        this.logger.warn(`Tenant database "${dbName}" already exists`);
      }
    } finally {
      await masterDataSource.destroy();
    }
  }

  /**
   * Drop a tenant database
   */
  async dropDatabase(dbName: string): Promise<void> {
    // Remove from cache first
    if (this.connections.has(dbName)) {
      const dataSource = this.connections.get(dbName);
      await dataSource?.destroy();
      this.connections.delete(dbName);
    }

    const masterDataSource = new DataSource({
      type: 'postgres',
      host: this.configService.get<string>('DB_HOST'),
      port: parseInt(this.configService.get<string>('DB_PORT'), 10),
      username: this.configService.get<string>('DB_USER'),
      password: this.configService.get<string>('DB_PASS'),
      database: 'postgres',
    });

    try {
      await masterDataSource.initialize();

      // Terminate all connections to the database
      await masterDataSource.query(
        `SELECT pg_terminate_backend(pg_stat_activity.pid)
         FROM pg_stat_activity
         WHERE pg_stat_activity.datname = $1
         AND pid <> pg_backend_pid()`,
        [dbName],
      );

      // Drop the database
      await masterDataSource.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      this.logger.log(`Tenant database "${dbName}" dropped successfully`);
    } finally {
      await masterDataSource.destroy();
    }
  }

  /**
   * Check if a connection exists
   */
  hasConnection(dbName: string): boolean {
    return this.connections.has(dbName);
  }

  /**
   * Get connection without creating
   */
  getConnection(dbName: string): DataSource | undefined {
    return this.connections.get(dbName);
  }

  /**
   * Create a DataSource instance for a tenant
   */
  private async createConnection(org: Organization): Promise<DataSource> {
    const dbName = org.dbName;
    const dbHost = org.dbHost || this.configService.get<string>('DB_HOST');
    const dbUser = org.dbUser || this.configService.get<string>('DB_USER');
    const dbPassword =
      org.dbPassword || this.configService.get<string>('DB_PASS');
    const dbPort = parseInt(this.configService.get<string>('DB_PORT'), 10);
    const poolSize = parseInt(
      this.configService.get<string>('TENANT_CONNECTION_POOL_SIZE') || '10',
      10,
    );

    const dataSource = new DataSource({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
      synchronize: false,
      logging: this.configService.get<string>('NODE_ENV') === 'development',
      entities: [
        __dirname + '/../../employees/*.entity{.ts,.js}',
        __dirname + '/../../employees/entities/*.entity{.ts,.js}',
        __dirname + '/../../settings/entities/*.entity{.ts,.js}',
        __dirname + '/../../ess/entities/*.entity{.ts,.js}',
        // Tenant RBAC only — exclude master-catalog entities (PlatformModule, OrganizationModuleEntitlement).
        RbacRole,
        RbacPermission,
        RbacRolePermission,
        RbacEmployeeRoleAssignment,
        RbacPermissionAuditLog,
      ],
      migrations: [__dirname + '/../../migrations/tenant/*.js'],
      extra: {
        max: poolSize,
        connectionTimeoutMillis: 10000,
      },
    });

    await dataSource.initialize();
    this.logger.log(`Connection established for tenant database "${dbName}"`);

    return dataSource;
  }

  /**
   * Clean up all connections on module destroy
   */
  async onModuleDestroy() {
    this.logger.log('Closing all tenant database connections...');
    const closePromises = Array.from(this.connections.values()).map(
      (dataSource) => dataSource.destroy(),
    );
    await Promise.all(closePromises);
    this.connections.clear();
  }
}
