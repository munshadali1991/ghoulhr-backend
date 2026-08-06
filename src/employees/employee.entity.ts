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
  organizationId?: string;

  @Column()
  @Index({ unique: true })
  employeeCode: string | undefined;

  @Column()
  name: string | undefined;

  @Column()
  @Index()
  email: string | undefined;

  @Column()
  password: string | undefined;

  @Column({
    type: 'enum',
    enum: EmployeeRole,
    default: EmployeeRole.EMPLOYEE,
  })
  @Index()
  role: EmployeeRole | undefined;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    default: EmployeeStatus.PENDING_ACTIVATION,
  })
  @Index()
  status: EmployeeStatus | undefined;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  departmentId?: string;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  departmentRef?: Department;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  designationId?: string;

  @ManyToOne(() => Designation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'designationId' })
  designationRef?: Designation;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  dateOfBirth?: Date;

  @Column({ nullable: true })
  dateOfJoining?: Date;

  @Column({ nullable: true })
  dateOfExit?: Date;

  @Column({ nullable: true })
  probationEndDate?: Date;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  emergencyContact?: string;

  @Column({ nullable: true })
  bloodGroup?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  accountNumber?: string;

  @Column({ nullable: true })
  ifscCode?: string;

  @Column({ nullable: true })
  panNumber?: string;

  @Column({ type: 'text', nullable: true })
  panNumberEnc?: string | null;

  @Column({ nullable: true })
  aadhaarNumber?: string;

  @Column({ type: 'text', nullable: true })
  aadhaarNumberEnc?: string | null;

  @Column({ nullable: true })
  passportNumber?: string;

  @Column({ type: 'date', nullable: true })
  passportExpiry?: Date;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  middleName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ nullable: true })
  personalEmail?: string;

  @Column({ nullable: true })
  officialEmail?: string;

  @Column({ nullable: true })
  alternateMobile?: string;

  @Column({ type: 'text', nullable: true })
  profilePhotoUrl?: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  profilePhotoStorageKey?: string | null;

  @Column({ nullable: true })
  uanNumber?: string;

  @Column({ nullable: true })
  esiNumber?: string;

  @Column({ nullable: true })
  pfNumber?: string;

  // Authentication & Security
  @Column({ type: 'boolean', default: true })
  mustChangePassword: boolean | undefined;

  @Column({ nullable: true })
  passwordChangedAt?: Date | null;

  @Column({ nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number | undefined;

  @Column({ nullable: true })
  lockedUntil?: Date | null;

  // Audit
  @Column()
  createdBy: string | undefined;

  @Column({ nullable: true })
  updatedBy?: string;

  @OneToOne('EmployeeEmploymentDetail', 'employee')
  employmentDetail?: unknown;

  @OneToOne('EmployeeSalaryDetail', 'employee')
  salaryDetail?: unknown;

  @OneToOne('EmployeeBankDetail', 'employee')
  bankDetail?: unknown;

  @OneToOne('EmployeeAccessControl', 'employee')
  accessControl?: unknown;

  @OneToMany('EmployeeDocument', 'employee')
  documents?: unknown[];

  @OneToMany('EmployeeAuditLog', 'employee')
  auditLogs?: unknown[];

  @OneToOne('EmployeeEmergencyContact', 'employee')
  emergencyContactDetail?: unknown;
}
