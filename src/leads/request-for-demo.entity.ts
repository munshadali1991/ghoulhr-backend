import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'request_for_demo' })
export class RequestForDemo {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty()
  @Column({ name: 'org_name', type: 'varchar' })
  orgName: string;

  @ApiProperty()
  @Column({ name: 'work_email', type: 'varchar' })
  workEmail: string;

  @ApiProperty()
  @Column({ name: 'contact_details', type: 'varchar' })
  contactDetails: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  address: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  country: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  city: string;

  @ApiProperty()
  @Column({ name: 'employee_size', type: 'varchar' })
  employeeSize: string;

  @ApiProperty()
  @Column({ name: 'company_type', type: 'varchar' })
  companyType: string;

  @ApiProperty()
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
