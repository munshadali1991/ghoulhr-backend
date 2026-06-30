import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationSubscription } from './organization-subscription.entity';
import { SubscriptionStatus } from './subscription-status.enum';
import { SubscriptionType } from './subscription-type.enum';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionHistoryQueryDto } from './dto/subscription-history-query.dto';
import {
  computeSubscriptionExpiresAt,
  isSubscriptionDateValid,
} from './constants/subscription-periods.constant';

export const SUBSCRIPTION_EXPIRED_MESSAGE =
  'Your organization plan has expired. Please renew the plan to continue the services.';

export const SUBSCRIPTION_MISSING_MESSAGE =
  'No active subscription plan for this organization. Please contact your administrator to renew the plan and continue services.';

export type SubscriptionAccessReason = 'valid' | 'missing' | 'expired' | 'inactive';

export interface SubscriptionSummary {
  type: SubscriptionType;
  startsAt: string;
  expiresAt: string;
  status: SubscriptionStatus;
  isValid: boolean;
}

export interface SubscriptionAccessResult {
  isValid: boolean;
  reason: SubscriptionAccessReason;
  subscription: OrganizationSubscription | null;
}

export interface PaginatedSubscriptionHistory {
  items: OrganizationSubscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class OrganizationSubscriptionService {
  constructor(
    @InjectRepository(OrganizationSubscription)
    private readonly subscriptionRepo: Repository<OrganizationSubscription>,
  ) {}

  computeExpiresAt(type: SubscriptionType, startsAt: Date): Date {
    return computeSubscriptionExpiresAt(type, startsAt);
  }

  parseStartsAt(startsAt: string): Date {
    const parsed = new Date(startsAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new ConflictException('Invalid subscription start date');
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  async createForOrganization(
    organizationId: string,
    dto: CreateSubscriptionDto,
    createdByUserId?: string,
  ): Promise<OrganizationSubscription> {
    const existingActive = await this.subscriptionRepo.findOne({
      where: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (existingActive) {
      throw new ConflictException(
        'Organization already has an active subscription. Use renew instead.',
      );
    }

    const startsAt = this.parseStartsAt(dto.startsAt);
    const expiresAt = this.computeExpiresAt(dto.subscriptionType, startsAt);

    const subscription = this.subscriptionRepo.create({
      organizationId,
      subscriptionType: dto.subscriptionType,
      startsAt,
      expiresAt,
      status: SubscriptionStatus.ACTIVE,
      createdByUserId,
      notes: dto.notes,
    });

    return this.subscriptionRepo.save(subscription);
  }

  async renewForOrganization(
    organizationId: string,
    dto: CreateSubscriptionDto,
    createdByUserId?: string,
  ): Promise<OrganizationSubscription> {
    const existingActive = await this.subscriptionRepo.findOne({
      where: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (existingActive) {
      existingActive.status = SubscriptionStatus.SUPERSEDED;
      await this.subscriptionRepo.save(existingActive);
    }

    const startsAt = this.parseStartsAt(dto.startsAt);
    const expiresAt = this.computeExpiresAt(dto.subscriptionType, startsAt);

    const subscription = this.subscriptionRepo.create({
      organizationId,
      subscriptionType: dto.subscriptionType,
      startsAt,
      expiresAt,
      status: SubscriptionStatus.ACTIVE,
      createdByUserId,
      notes: dto.notes,
    });

    return this.subscriptionRepo.save(subscription);
  }

  async getCurrentSubscription(
    organizationId: string,
  ): Promise<OrganizationSubscription | null> {
    return this.subscriptionRepo.findOne({
      where: {
        organizationId,
        status: SubscriptionStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getSubscriptionHistoryPaginated(
    organizationId: string,
    options: SubscriptionHistoryQueryDto = {},
  ): Promise<PaginatedSubscriptionHistory> {
    const safePage = Math.max(1, options.page ?? 1);
    const safeLimit = Math.min(50, Math.max(1, options.limit ?? 10));
    const skip = (safePage - 1) * safeLimit;

    const qb = this.subscriptionRepo
      .createQueryBuilder('sub')
      .where('sub.organizationId = :organizationId', { organizationId })
      .orderBy('sub.createdAt', 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (options.status) {
      qb.andWhere('sub.status = :status', { status: options.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit),
    };
  }

  async markExpiredSubscriptionsForOrganization(
    organizationId: string,
  ): Promise<void> {
    const now = new Date();
    await this.subscriptionRepo
      .createQueryBuilder()
      .update(OrganizationSubscription)
      .set({ status: SubscriptionStatus.EXPIRED })
      .where('organizationId = :organizationId', { organizationId })
      .andWhere('status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('"expiresAt" <= :now', { now })
      .execute();
  }

  getSubscriptionAccess(
    subscription: OrganizationSubscription | null,
    now = new Date(),
  ): SubscriptionAccessResult {
    if (!subscription) {
      return { isValid: false, reason: 'missing', subscription: null };
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return { isValid: false, reason: 'inactive', subscription };
    }

    if (!isSubscriptionDateValid(subscription.expiresAt, now)) {
      return { isValid: false, reason: 'expired', subscription };
    }

    return { isValid: true, reason: 'valid', subscription };
  }

  async getSubscriptionAccessForOrganization(
    organizationId: string,
  ): Promise<SubscriptionAccessResult> {
    await this.markExpiredSubscriptionsForOrganization(organizationId);
    const subscription = await this.getCurrentSubscription(organizationId);
    return this.getSubscriptionAccess(subscription);
  }

  toSummary(
    access: SubscriptionAccessResult,
  ): SubscriptionSummary | null {
    if (!access.subscription) {
      return null;
    }

    const { subscription } = access;
    return {
      type: subscription.subscriptionType,
      startsAt: subscription.startsAt.toISOString(),
      expiresAt: subscription.expiresAt.toISOString(),
      status: subscription.status,
      isValid: access.isValid,
    };
  }

  async getSummariesForOrganizationIds(
    organizationIds: string[],
  ): Promise<
    Map<
      string,
      {
        isValid: boolean;
        reason: SubscriptionAccessReason;
        type?: SubscriptionType;
        startsAt?: string;
        expiresAt?: string;
        status?: SubscriptionStatus;
      }
    >
  > {
    const result = new Map<
      string,
      {
        isValid: boolean;
        reason: SubscriptionAccessReason;
        type?: SubscriptionType;
        startsAt?: string;
        expiresAt?: string;
        status?: SubscriptionStatus;
      }
    >();

    if (organizationIds.length === 0) {
      return result;
    }

    const activeSubscriptions = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .where('sub.organizationId IN (:...organizationIds)', { organizationIds })
      .andWhere('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      .getMany();

    const subscriptionByOrgId = new Map(
      activeSubscriptions.map((sub) => [sub.organizationId, sub]),
    );

    for (const organizationId of organizationIds) {
      const access = this.getSubscriptionAccess(
        subscriptionByOrgId.get(organizationId) ?? null,
      );
      const summary = this.toSummary(access);
      result.set(organizationId, {
        isValid: access.isValid,
        reason: access.reason,
        ...(summary
          ? {
              type: summary.type,
              startsAt: summary.startsAt,
              expiresAt: summary.expiresAt,
              status: summary.status,
            }
          : {}),
      });
    }

    return result;
  }

  async assertOrganizationHasValidSubscription(
    organizationId: string,
  ): Promise<void> {
    const access = await this.getSubscriptionAccessForOrganization(
      organizationId,
    );

    if (access.isValid) {
      return;
    }

    if (access.reason === 'missing') {
      throw new ForbiddenException(SUBSCRIPTION_MISSING_MESSAGE);
    }

    throw new ForbiddenException(SUBSCRIPTION_EXPIRED_MESSAGE);
  }

  async markExpiredSubscriptions(): Promise<number> {
    const now = new Date();
    const result = await this.subscriptionRepo
      .createQueryBuilder()
      .update(OrganizationSubscription)
      .set({ status: SubscriptionStatus.EXPIRED })
      .where('status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('"expiresAt" <= :now', { now })
      .execute();

    return result.affected ?? 0;
  }

  async ensureOrganizationExists(
    organizationId: string,
    findById: (id: string) => Promise<unknown>,
  ): Promise<void> {
    const org = await findById(organizationId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
  }
}
