import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

@Entity('employees')
export class Employee extends BaseEntity {
  @Column()
  @Index()
  globalUserId: string;

  @Column()
  name: string;

  @Column()
  @Index()
  email: string;

  @Column({
    type: 'enum',
    enum: ['ADMIN', 'EMPLOYEE', 'MANAGER', 'HR'],
    default: 'EMPLOYEE',
  })
  role: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  designation?: string;

  @Column({ nullable: true })
  employeeId?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  dateOfBirth?: string;

  @Column({ nullable: true })
  dateOfJoining?: string;

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

  @Column({ nullable: true })
  aadhaarNumber?: string;

  @Column({ nullable: true })
  uanNumber?: string;

  @Column({ nullable: true })
  esiNumber?: string;

  @Column({ nullable: true })
  pfNumber?: string;
}
