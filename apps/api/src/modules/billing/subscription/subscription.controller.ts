import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/identity/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionItemsDto } from './dto/update-subscription-items.dto';

/**
 * REST controller for platform billing subscription management.
 * All endpoints require platform admin authentication.
 *
 * POST /billing/subscriptions — Create a new subscription for a tenant
 * PATCH /billing/subscriptions/:id/items — Add or remove a module item
 */
@Controller('billing/subscriptions')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * POST /billing/subscriptions
   * Creates a Stripe Billing subscription for a tenant based on their plan tier.
   * Requirement 7.1
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionService.createSubscription(dto);
  }

  /**
   * PATCH /billing/subscriptions/:id/items
   * Adds or removes a subscription item (module) on an existing subscription.
   * Requirement 7.2
   */
  @Patch(':id/items')
  @HttpCode(HttpStatus.OK)
  async updateItems(
    @Param('id') subscriptionId: string,
    @Body() dto: UpdateSubscriptionItemsDto,
  ) {
    if (dto.action === 'add') {
      return this.subscriptionService.addModuleItem(
        subscriptionId,
        dto.module,
        dto.priceId ?? `price_${dto.module}_monthly`,
        dto.price ?? '0.00',
      );
    }

    await this.subscriptionService.removeModuleItem(subscriptionId, dto.module);
    return { message: `Module "${dto.module}" removed from subscription` };
  }
}
