import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reconciles older tenant databases that ran the schema-partition migrations
 * (which moved tables into core/master/feature/audit/config schemas) back to a
 * single `public` schema. Idempotent: a fresh tenant DB where every object was
 * already created in `public` finds nothing to move and skips through cleanly.
 *
 * The migration walks the namespaced schemas, calls `ALTER TABLE ... SET SCHEMA
 * public` for each known table (FK references travel with the table by OID, so
 * order does not matter), restores the employee profile view and role enum
 * type, then drops the now-empty schemas.
 */
export class RevertToPublicSchema1776000000004
  implements MigrationInterface
{
  name = 'RevertToPublicSchema1776000000004';

  private readonly tablesBySchema: Record<string, string[]> = {
    core: ['employees', 'employee_access_control'],
    master: ['departments', 'designations', 'designation_departments'],
    feature: [
      'employee_employment_details',
      'employee_salary_details',
      'employee_bank_details',
      'employee_documents',
      'employee_emergency_contacts',
    ],
    audit: ['employee_audit_logs'],
    config: ['settings_catalog', 'tenant_settings', 'organization_settings'],
  };

  private readonly viewsBySchema: Record<string, string[]> = {
    config: ['vw_employee_profile'],
  };

  private readonly enumsBySchema: Record<string, string[]> = {
    core: ['employees_role_enum'],
  };

  private readonly legacySchemas = ['core', 'master', 'feature', 'audit', 'config'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [schema, tables] of Object.entries(this.tablesBySchema)) {
      for (const table of tables) {
        await this.moveTableToPublic(queryRunner, schema, table);
      }
    }

    for (const [schema, views] of Object.entries(this.viewsBySchema)) {
      for (const view of views) {
        await this.moveViewToPublic(queryRunner, schema, view);
      }
    }

    for (const [schema, types] of Object.entries(this.enumsBySchema)) {
      for (const typeName of types) {
        await this.moveTypeToPublic(queryRunner, schema, typeName);
      }
    }

    for (const schema of this.legacySchemas) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" RESTRICT`);
    }
  }

  public async down(): Promise<void> {
    // Intentionally no-op: re-introducing schema partitioning is out of scope
    // and would require recreating the schemas plus re-running ALTER ... SET
    // SCHEMA on every object. The forward path is the source of truth.
  }

  private async moveTableToPublic(
    queryRunner: QueryRunner,
    sourceSchema: string,
    tableName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = '${sourceSchema}' AND table_name = '${tableName}'
        ) THEN
          EXECUTE 'ALTER TABLE "${sourceSchema}"."${tableName}" SET SCHEMA public';
        END IF;
      END
      $$;
    `);
  }

  private async moveViewToPublic(
    queryRunner: QueryRunner,
    sourceSchema: string,
    viewName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.views
          WHERE table_schema = '${sourceSchema}' AND table_name = '${viewName}'
        ) THEN
          EXECUTE 'ALTER VIEW "${sourceSchema}"."${viewName}" SET SCHEMA public';
        END IF;
      END
      $$;
    `);
  }

  private async moveTypeToPublic(
    queryRunner: QueryRunner,
    sourceSchema: string,
    typeName: string,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = '${sourceSchema}' AND t.typname = '${typeName}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public' AND t.typname = '${typeName}'
        ) THEN
          EXECUTE 'ALTER TYPE "${sourceSchema}"."${typeName}" SET SCHEMA public';
        END IF;
      END
      $$;
    `);
  }
}
