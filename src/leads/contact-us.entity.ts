import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'contact_us' })
export class ContactUs {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  name: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  email: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  contact: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  mobile: string;

  @ApiProperty()
  @Column({ type: 'varchar' })
  company: string;

  @ApiProperty()
  @Column({ name: 'company_size', type: 'varchar' })
  companySize: string;

  @ApiProperty()
  @Column({ type: 'text' })
  message: string;

  @ApiProperty()
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
