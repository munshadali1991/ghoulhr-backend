import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeEmergencyContact1774000000000 implements MigrationInterface {
  name = 'EmployeeEmergencyContact1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_emergency_contacts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "employeeId" uuid NOT NULL,
        "contactName" character varying(200) NOT NULL,
        "contactPhone" character varying(32) NOT NULL,
        "relationship" character varying(120) NOT NULL,
        CONSTRAINT "PK_employee_emergency_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_emergency_employee" UNIQUE ("employeeId"),
        CONSTRAINT "FK_emergency_employee" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_emergency_contacts"`);
  }
}
