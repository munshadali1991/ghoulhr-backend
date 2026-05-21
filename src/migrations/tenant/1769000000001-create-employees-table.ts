import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeesTable1769000000001 implements MigrationInterface {
  name = 'CreateEmployeesTable1769000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "employees_role_enum" AS ENUM('ADMIN', 'EMPLOYEE', 'MANAGER', 'HR')`,
    );

    await queryRunner.query(`
            CREATE TABLE "employees" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                "globalUserId" character varying NOT NULL,
                "name" character varying NOT NULL,
                "email" character varying NOT NULL,
                "role" "employees_role_enum" NOT NULL DEFAULT 'EMPLOYEE',
                "department" character varying,
                "designation" character varying,
                "employeeId" character varying,
                "phoneNumber" character varying,
                "dateOfBirth" character varying,
                "dateOfJoining" character varying,
                "address" text,
                "emergencyContact" character varying,
                "bloodGroup" character varying,
                "bankName" character varying,
                "accountNumber" character varying,
                "ifscCode" character varying,
                "panNumber" character varying,
                "aadhaarNumber" character varying,
                "uanNumber" character varying,
                "esiNumber" character varying,
                "pfNumber" character varying,
                CONSTRAINT "PK_employees_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(
      `CREATE INDEX "IDX_employees_globalUserId" ON "employees" ("globalUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_email" ON "employees" ("email")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_employees_email"`);
    await queryRunner.query(`DROP INDEX "IDX_employees_globalUserId"`);

    await queryRunner.query(`DROP TABLE "employees"`);

    await queryRunner.query(`DROP TYPE "employees_role_enum"`);
  }
}
