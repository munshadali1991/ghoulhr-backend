import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Department } from './department.entity';
import { Designation } from './designation.entity';

@Entity({ name: 'designation_departments' })
export class DesignationDepartment {
  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @PrimaryColumn({ type: 'uuid' })
  designationId: string;

  @PrimaryColumn({ type: 'uuid' })
  departmentId: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt: Date;

  @ManyToOne(() => Designation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'designationId' })
  designation: Designation;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' })
  department: Department;
}
