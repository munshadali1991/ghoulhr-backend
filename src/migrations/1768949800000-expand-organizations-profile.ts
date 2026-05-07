import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandOrganizationsProfile1768949800000
  implements MigrationInterface
{
  name = 'ExpandOrganizationsProfile1768949800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "shortName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "industryType" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "organizationType" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "dateOfIncorporation" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "companyLogo" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "websiteUrl" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "timeZone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "financialYearStartMonth" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "registeredOfficeAddress" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "city" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "state" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "country" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "pinCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "contactNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "officialEmail" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "panNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "tanNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "gstin" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "pfEstablishmentCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "esiCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "professionalTaxRegistrationNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "labourWelfareFundDetails" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "cinNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "salaryStructureTemplate" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "defaultEarningsAndDeductions" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "pfEsiApplicability" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "tdsSettings" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "bankDetailsForSalaryProcessing" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "payCycle" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "salaryDisbursementDate" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "adminName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "adminEmail" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "adminMobileNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "adminRolePermissions" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "bankName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "branchName" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "ifscCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "accountNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "monthlySubscriptionAmount" numeric(12,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "monthlySubscriptionAmount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "accountNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "ifscCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "branchName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "bankName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "adminRolePermissions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "adminMobileNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "adminEmail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "adminName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "salaryDisbursementDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "payCycle"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "bankDetailsForSalaryProcessing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "tdsSettings"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "pfEsiApplicability"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "defaultEarningsAndDeductions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "salaryStructureTemplate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "cinNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "labourWelfareFundDetails"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "professionalTaxRegistrationNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "esiCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "pfEstablishmentCode"`,
    );
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "gstin"`);
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "tanNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "panNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "officialEmail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "contactNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "pinCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "country"`,
    );
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "state"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN "city"`);
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "registeredOfficeAddress"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "financialYearStartMonth"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "timeZone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "websiteUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "companyLogo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "dateOfIncorporation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "organizationType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "industryType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "shortName"`,
    );
  }
}
