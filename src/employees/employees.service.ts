import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Employee } from './employee.entity';

export interface CreateEmployeeDto {
  globalUserId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  address?: string;
}

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  /**
   * Create a new employee in tenant database
   */
  async create(dto: CreateEmployeeDto, dataSource: DataSource): Promise<Employee> {
    const employeeRepo = dataSource.getRepository(Employee);
    
    const email = dto.email.toLowerCase().trim();
    const existing = await employeeRepo.findOne({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Employee already exists with this email');
    }

    const employee = employeeRepo.create({
      ...dto,
      email,
      role: dto.role || 'EMPLOYEE',
    });

    return employeeRepo.save(employee);
  }

  /**
   * Find employee by email in tenant database
   */
  async findByEmail(email: string, dataSource: DataSource): Promise<Employee | null> {
    const employeeRepo = dataSource.getRepository(Employee);
    return employeeRepo.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  /**
   * Find employee by global user ID
   */
  async findByGlobalUserId(globalUserId: string, dataSource: DataSource): Promise<Employee | null> {
    const employeeRepo = dataSource.getRepository(Employee);
    return employeeRepo.findOne({
      where: { globalUserId },
    });
  }

  /**
   * Find all employees in tenant database
   */
  async findAll(dataSource: DataSource): Promise<Employee[]> {
    const employeeRepo = dataSource.getRepository(Employee);
    return employeeRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find employee by ID
   */
  async findById(id: string, dataSource: DataSource): Promise<Employee | null> {
    const employeeRepo = dataSource.getRepository(Employee);
    return employeeRepo.findOne({ where: { id } });
  }
}
