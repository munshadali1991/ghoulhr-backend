import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Role } from '../roles/roles.enum';
import { UserStatus } from './user-status.enum';

interface CreateUserInput {
  organizationId: string;
  email: string;
  password: string;
  role: Role;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(input: CreateUserInput) {
    const email = input.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({
      where: { email, organizationId: input.organizationId },
    });

    if (existing) {
      throw new ConflictException('User already exists for this organization');
    }

    const user = this.userRepo.create({
      organizationId: input.organizationId,
      email,
      password: input.password,
      role: input.role,
      status: UserStatus.ACTIVE,
    });

    return this.userRepo.save(user);
  }

  findByEmailAndOrganization(email: string, organizationId: string) {
    return this.userRepo.findOne({
      where: { email: email.toLowerCase().trim(), organizationId },
    });
  }

  findByEmail(email: string) {
    return this.userRepo.find({
      where: { email: email.toLowerCase().trim() },
      select: ['id', 'organizationId', 'email', 'password', 'role', 'status'],
    });
  }

  async hasAnySuperAdmin() {
    const total = await this.userRepo.count({
      where: { role: Role.SUPER_ADMIN },
      withDeleted: false,
    });
    return total > 0;
  }
}
