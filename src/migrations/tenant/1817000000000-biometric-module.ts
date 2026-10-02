import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ZKTeco ADMS biometric integration: employee hardware PIN, device registry,
 * unmapped punch queue, punch metadata columns, audit trail, settings catalog.
 */
export class BiometricModule1817000000000 implements MigrationInterface {
  name = 'BiometricModule1817000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "biometricId" integer
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_employees_org_biometricId"
      ON "employees" ("organizationId", "biometricId")
      WHERE "biometricId" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "employees"."biometricId" IS
      'Integer PIN assigned on wall biometric devices; never stores biometric templates'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "biometric_devices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "serialNumber" character varying(64) NOT NULL,
        "name" character varying(120) NOT NULL,
        "brand" character varying(32) NOT NULL DEFAULT 'ZKTECO',
        "locationId" uuid,
        "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
        "lastSeenAt" TIMESTAMPTZ,
        "firmwareVersion" character varying(64),
        "timezone" character varying(64),
        "commKeyHash" character varying(128),
        CONSTRAINT "PK_biometric_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_biometric_devices_location"
          FOREIGN KEY ("locationId") REFERENCES "locations_configurations"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_biometric_devices_org_serial"
      ON "biometric_devices" ("organizationId", "serialNumber")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_biometric_devices_org_status"
      ON "biometric_devices" ("organizationId", "status")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "biometric_devices" IS
      'Wall-mounted biometric attendance devices registered per tenant'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "biometric_unmapped_punches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "deviceId" uuid,
        "serialNumber" character varying(64) NOT NULL,
        "biometricId" integer NOT NULL,
        "eventTimestamp" TIMESTAMPTZ NOT NULL,
        "rawPunchType" character varying(32),
        "rawPayload" text,
        "status" character varying(16) NOT NULL DEFAULT 'OPEN',
        "resolvedEmployeeId" uuid,
        "resolvedAt" TIMESTAMPTZ,
        "resolvedByEmployeeId" uuid,
        CONSTRAINT "PK_biometric_unmapped_punches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_biometric_unmapped_device"
          FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_biometric_unmapped_resolved_employee"
          FOREIGN KEY ("resolvedEmployeeId") REFERENCES "employees"("id")
          ON DELETE SET NULL,
        CONSTRAINT "FK_biometric_unmapped_resolved_by"
          FOREIGN KEY ("resolvedByEmployeeId") REFERENCES "employees"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_biometric_unmapped_org_bio_status"
      ON "biometric_unmapped_punches" ("organizationId", "biometricId", "status")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_biometric_unmapped_org_event"
      ON "biometric_unmapped_punches" ("organizationId", "eventTimestamp")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "biometric_unmapped_punches" IS
      'Device punches whose hardware PIN is not yet mapped to an employee'
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      ADD COLUMN IF NOT EXISTS "deviceId" uuid,
      ADD COLUMN IF NOT EXISTS "deviceSerial" character varying(64),
      ADD COLUMN IF NOT EXISTS "hardwareUserId" integer,
      ADD COLUMN IF NOT EXISTS "externalEventKey" character varying(128)
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "attendance_punches"
          ADD CONSTRAINT "FK_attendance_punches_device"
          FOREIGN KEY ("deviceId") REFERENCES "biometric_devices"("id")
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_attendance_punches_org_external_key"
      ON "attendance_punches" ("organizationId", "externalEventKey")
      WHERE "externalEventKey" IS NOT NULL AND "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_attendance_punches_source_time"
      ON "attendance_punches" ("organizationId", "source", "punchedAt")
      WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "biometric_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "organizationId" uuid NOT NULL,
        "actorEmployeeId" uuid,
        "action" character varying(64) NOT NULL,
        "entityType" character varying(64),
        "entityId" character varying(64),
        "reason" text,
        "beforeJson" jsonb,
        "afterJson" jsonb,
        CONSTRAINT "PK_biometric_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_biometric_audit_actor"
          FOREIGN KEY ("actorEmployeeId") REFERENCES "employees"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_biometric_audit_org_created"
      ON "biometric_audit_logs" ("organizationId", "createdAt")
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "biometric_audit_logs" IS
      'Audit trail for biometric mapping, device changes, and unmapped resolution'
    `);

    await queryRunner.query(`
      INSERT INTO "settings_catalog" ("key","valueType","scope","isSecret","isActive")
      VALUES
        ('attendance.punch_direction_mode','string','tenant',false,true),
        ('attendance.biometric_dedupe_window_seconds','number','tenant',false,true)
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "settings_catalog"
      WHERE "key" IN (
        'attendance.punch_direction_mode',
        'attendance.biometric_dedupe_window_seconds'
      )
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "biometric_audit_logs"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_attendance_punches_source_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_attendance_punches_org_external_key"`,
    );

    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      DROP CONSTRAINT IF EXISTS "FK_attendance_punches_device"
    `);
    await queryRunner.query(`
      ALTER TABLE "attendance_punches"
      DROP COLUMN IF EXISTS "externalEventKey",
      DROP COLUMN IF EXISTS "hardwareUserId",
      DROP COLUMN IF EXISTS "deviceSerial",
      DROP COLUMN IF EXISTS "deviceId"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "biometric_unmapped_punches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "biometric_devices"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_employees_org_biometricId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "employees" DROP COLUMN IF EXISTS "biometricId"
    `);
  }
}
