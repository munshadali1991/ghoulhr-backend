import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { OrganizationSubscriptionService } from '../organization-subscription.service';
import type { TenantRequest } from '../../common/middleware/tenant-resolver.middleware';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly subscriptionService: OrganizationSubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();

    if (!request.organization?.id) {
      return true;
    }

    await this.subscriptionService.assertOrganizationHasValidSubscription(
      request.organization.id,
    );

    return true;
  }
}
