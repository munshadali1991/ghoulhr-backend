import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { SkillProficiency } from '../enums/skill-proficiency.enum';
import { Skill } from './skill.entity';

@Entity({ name: 'employee_skills' })
@Index(['organizationId', 'employeeId'])
@Index(['skillId'])
export class EmployeeSkill extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid' })
  skillId: string;

  @ManyToOne(() => Skill, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skillId' })
  skill?: Skill;

  @Column({ type: 'int' })
  experienceMonths: number;

  @Column({ type: 'varchar', length: 16 })
  proficiency: SkillProficiency;
}
