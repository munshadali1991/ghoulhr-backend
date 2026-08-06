import {
  Entity,
  Column,
  Index,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { EmployeeEmploymentDetail } from './entities/employee-employment-detail.entity';
import { EmployeeSalaryDetail } from './entities/employee-salary-detail.entity';
import { EmployeeBankDetail } from './entities/employee-bank-detail.entity';
import { EmployeeAccessControl } from './entities/employee-access.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeAuditLog } from './entities/employee-audit-log.entity';
import { EmployeeEmergencyContact } from './entities/employee-emergency-contact.entity';

export enum EmployeeRole {
  ORG_ADMIN = 'ORG_ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TERMINATED = 'TERMINATED',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
}

@Entity({ name: 'employees' })
export class Employee extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string | null;

  @Column()
  @Index({ unique: true })
  employeeCode!: string;

  @Column()
  name!: string;

  @Column()
  @Index()
  email!: string;

  @Column()
  password!: string;

  @Column({
    type: 'enum',
    enum: EmployeeRole,
    default: EmployeeRole.EMPLOYEE,
  })
  @Index()
  role!: EmployeeRole;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    default: EmployeeStatus.PENDING_ACTIVATION,
  })
  @Index()
  status!: EmployeeStatus;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  departmentId?: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  departmentRef?: Department | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  designationId?: string | null;

  @ManyToOne(() => Designation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'designationId' })
  designationRef?: Designation | null;

  @Column({ nullable: true })
  phoneNumber?: string | null;

  @Column({ nullable: true })
  dateOfBirth?: Date | null;

  @Column({ nullable: true })
  dateOfJoining?: Date | null;

  @Column({ nullable: true })
  dateOfExit?: Date | null;

  @Column({ nullable: true })
  probationEndDate?: Date | null;

  @Column({ nullable: true })
  address?: string | null;

  @Column({ nullable: true })
  emergencyContact?: string | null;

  @Column({ nullable: true })
  bloodGroup?: string | null;

  @Column({ nullable: true })
  bankName?: string | null;

  @Column({ nullable: true })
  accountNumber?: string | null;

  @Column({ nullable: true })
  ifscCode?: string | null;

  @Column({ nullable: true })
  panNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  panNumberEnc?: string | null;

  @Column({ nullable: true })
  aadhaarNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  aadhaarNumberEnc?: string | null;

  @Column({ nullable: true })
  passportNumber?: string | null;

  @Column({ type: 'date', nullable: true })
  passportExpiry?: Date | null;

  @Column({ nullable: true })
  firstName?: string | null;

  @Column({ nullable: true })
  middleName?: string | null;

  @Column({ nullable: true })
  lastName?: string | null;

  @Column({ nullable: true })
  gender?: string | null;

  @Column({ nullable: true })
  personalEmail?: string | null;

  @Column({ nullable: true })
  officialEmail?: string | null;

  @Column({ nullable: true })
  alternateMobile?: string | null;

  @Column({ type: 'text', nullable: true })
  profilePhotoUrl?: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  profilePhotoStorageKey?: string | null;

  @Column({ nullable: true })
  uanNumber?: string | null;

  @Column({ nullable: true })
  esiNumber?: string | null;

  @Column({ nullable: true })
  pfNumber?: string | null;

  // Authentication & Security
  @Column({ type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Column({ nullable: true })
  passwordChangedAt?: Date | null;

  @Column({ nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ nullable: true })
  lockedUntil?: Date | null;

  // Audit
  @Column()
  createdBy!: string;

  @Column({ nullable: true })
  updatedBy?: string | null;

  @OneToOne(() => EmployeeEmploymentDetail, (d) => d.employee)
  employmentDetail?: EmployeeEmploymentDetail;

  @OneToOne(() => EmployeeSalaryDetail, (d) => d.employee)
  salaryDetail?: EmployeeSalaryDetail;

  @OneToOne(() => EmployeeBankDetail, (d) => d.employee)
  bankDetail?: EmployeeBankDetail;

  @OneToOne(() => EmployeeAccessControl, (d) => d.employee)
  accessControl?: EmployeeAccessControl;

  @OneToMany(() => EmployeeDocument, (d) => d.employee)
  documents?: EmployeeDocument[];

  @OneToMany(() => EmployeeAuditLog, (d) => d.employee)
  auditLogs?: EmployeeAuditLog[];

  @OneToOne(() => EmployeeEmergencyContact, (d) => d.employee)
  emergencyContactDetail?: EmployeeEmergencyContact;
}
