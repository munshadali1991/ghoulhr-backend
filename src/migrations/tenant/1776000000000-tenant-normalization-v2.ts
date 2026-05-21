import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantNormalizationV21776000000000
  implements MigrationInterface
{
  name = 'TenantNormalizationV21776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "departments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "code" character varying(24),
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_departments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_departments_name" UNIQUE ("name"),
        CONSTRAINT "UQ_departments_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "designations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "name" character varying(120) NOT NULL,
        "code" character varying(24),
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_designations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_designations_name" UNIQUE ("name"),
        CONSTRAINT "UQ_designations_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "designation_departments" (
        "designationId" uuid NOT NULL,
        "departmentId" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_designation_departments" PRIMARY KEY ("designationId","departmentId"),
        CONSTRAINT "FK_designation_departments_designation"
          FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_designation_departments_department"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_designation_departments_department_designation"
      ON "designation_departments" ("departmentId", "designationId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "settings_catalog" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "key" character varying(191) NOT NULL,
        "valueType" character varying(40) NOT NULL,
        "scope" character varying(40) NOT NULL DEFAULT 'tenant',
        "isSecret" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_settings_catalog" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_settings_catalog_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "settingCatalogId" uuid NOT NULL,
        "value" jsonb NOT NULL,
        CONSTRAINT "PK_tenant_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_settings_catalog" UNIQUE ("settingCatalogId"),
        CONSTRAINT "FK_tenant_settings_catalog"
          FOREIGN KEY ("settingCatalogId") REFERENCES "settings_catalog"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD COLUMN IF NOT EXISTS "departmentId" uuid,
      ADD COLUMN IF NOT EXISTS "designationId" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employees_departmentId"
      ON "employees" ("departmentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_employees_designationId"
      ON "employees" ("designationId")
    `);

    await queryRunner.query(`
      INSERT INTO "settings_catalog" ("key","valueType","scope","isSecret","isActive")
      VALUES
        ('employee.id_prefix','string','tenant',false,true),
        ('employee.auto_generate_id','boolean','tenant',false,true),
        ('employee.required_fields','json','tenant',false,true),
        ('employee.default_probation_period','number','tenant',false,true),
        ('attendance.working_days','json','tenant',false,true),
        ('attendance.shifts','json','tenant',false,true),
        ('attendance.grace_period_minutes','number','tenant',false,true),
        ('attendance.half_day_threshold_minutes','number','tenant',false,true),
        ('attendance.overtime_enabled','boolean','tenant',false,true),
        ('attendance.overtime_rules','json','tenant',false,true),
        ('attendance.tracking_mode','string','tenant',false,true),
        ('attendance.geo_fencing_enabled','boolean','tenant',false,true),
        ('attendance.allowed_ip_addresses','json','tenant',false,true)
      ON CONFLICT ("key") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "tenant_settings" ("settingCatalogId","value")
      SELECT c."id", s."value"
      FROM "settings_catalog" c
      JOIN "organization_settings" s ON s."key" = c."key"
      ON CONFLICT ("settingCatalogId") DO UPDATE
      SET "value" = EXCLUDED."value", "updatedAt" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "departments" ("id","name","code","isActive")
      SELECT
        COALESCE(NULLIF(TRIM(d->>'id'), '')::uuid, gen_random_uuid()),
        TRIM(d->>'name'),
        NULLIF(TRIM(d->>'code'), ''),
        COALESCE((d->>'isActive')::boolean, true)
      FROM "organization_settings" s
      CROSS JOIN LATERAL jsonb_array_elements(s."value") AS d
      WHERE s."key" = 'employee.departments'
        AND NULLIF(TRIM(d->>'name'), '') IS NOT NULL
      ON CONFLICT ("name") DO UPDATE
      SET "code" = COALESCE(EXCLUDED."code", "departments"."code"),
          "isActive" = EXCLUDED."isActive",
          "updatedAt" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "departments" ("name","isActive")
      SELECT DISTINCT TRIM("department"), true
      FROM "employees"
      WHERE NULLIF(TRIM("department"), '') IS NOT NULL
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "designations" ("id","name","isActive")
      SELECT
        COALESCE(NULLIF(TRIM(d->>'id'), '')::uuid, gen_random_uuid()),
        TRIM(d->>'name'),
        COALESCE((d->>'isActive')::boolean, true)
      FROM "organization_settings" s
      CROSS JOIN LATERAL jsonb_array_elements(s."value") AS d
      WHERE s."key" = 'employee.designations'
        AND NULLIF(TRIM(d->>'name'), '') IS NOT NULL
      ON CONFLICT ("name") DO UPDATE
      SET "isActive" = EXCLUDED."isActive",
          "updatedAt" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "designations" ("name","isActive")
      SELECT DISTINCT TRIM("designation"), true
      FROM "employees"
      WHERE NULLIF(TRIM("designation"), '') IS NOT NULL
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "designation_departments" ("designationId","departmentId")
      SELECT
        des."id",
        dep."id"
      FROM "organization_settings" s
      CROSS JOIN LATERAL jsonb_array_elements(s."value") AS dg
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(dg->'departmentIds', '[]'::jsonb)) AS dep_id
      JOIN "designations" des
        ON LOWER(des."name") = LOWER(TRIM(dg->>'name'))
      JOIN "departments" dep
        ON dep."id" = NULLIF(TRIM(dep_id), '')::uuid
      WHERE s."key" = 'employee.designations'
      ON CONFLICT ("designationId","departmentId") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "designation_departments" ("designationId","departmentId")
      SELECT DISTINCT
        des."id",
        dep."id"
      FROM "employees" e
      JOIN "designations" des ON LOWER(des."name") = LOWER(TRIM(e."designation"))
      JOIN "departments" dep ON LOWER(dep."name") = LOWER(TRIM(e."department"))
      WHERE NULLIF(TRIM(e."designation"), '') IS NOT NULL
        AND NULLIF(TRIM(e."department"), '') IS NOT NULL
      ON CONFLICT ("designationId","departmentId") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "employees" e
      SET "departmentId" = dep."id"
      FROM "departments" dep
      WHERE e."departmentId" IS NULL
        AND NULLIF(TRIM(e."department"), '') IS NOT NULL
        AND LOWER(dep."name") = LOWER(TRIM(e."department"))
    `);
    await queryRunner.query(`
      UPDATE "employees" e
      SET "designationId" = des."id"
      FROM "designations" des
      WHERE e."designationId" IS NULL
        AND NULLIF(TRIM(e."designation"), '') IS NOT NULL
        AND LOWER(des."name") = LOWER(TRIM(e."designation"))
    `);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employees_departmentId"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `).catch(() => undefined);

    await queryRunner.query(`
      ALTER TABLE "employees"
      ADD CONSTRAINT "FK_employees_designationId"
      FOREIGN KEY ("designationId") REFERENCES "designations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `).catch(() => undefined);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW "vw_employee_profile" AS
      SELECT
        e."id",
        e."employeeCode",
        e."name",
        e."email",
        e."role",
        e."status",
        e."dateOfJoining",
        e."departmentId",
        dep."name" AS "departmentName",
        e."designationId",
        des."name" AS "designationName"
      FROM "employees" e
      LEFT JOIN "departments" dep ON dep."id" = e."departmentId"
      LEFT JOIN "designations" des ON des."id" = e."designationId"
      WHERE e."deletedAt" IS NULL
    `);

    await queryRunner.query(
      `COMMENT ON TABLE "departments" IS 'Tenant master for departments used in employee assignment.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "designations" IS 'Tenant master for designations used in employee assignment.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "designation_departments" IS 'Allowed many-to-many mapping between designations and departments.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "settings_catalog" IS 'Catalog of supported tenant setting keys and value types.'`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE "tenant_settings" IS 'Tenant setting values keyed by settings catalog entries.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."departmentId" IS 'Normalized FK to departments master.'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "employees"."designationId" IS 'Normalized FK to designations master.'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "vw_employee_profile"`);
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_employees_designationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "FK_employees_departmentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP COLUMN IF EXISTS "designationId", DROP COLUMN IF EXISTS "departmentId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settings_catalog"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "designation_departments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "designations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "departments"`);
  }
}
