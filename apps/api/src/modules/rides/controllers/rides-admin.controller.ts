import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { TenantDbService } from '../../../database/tenant-db.service';
import * as schema from '../../../database/schemas/tenant.schema';
import {
  CreateVehicleClassDto,
  UpdateVehicleClassDto,
  CreateFareRuleDto,
  UpdateFareRuleDto,
  CreateZoneDto,
} from '../dto/admin-rides.dto';

/**
 * RidesAdminController
 *
 * Tenant admin endpoints for configuring ride-hailing:
 * - Vehicle classes (CRUD)
 * - Fare rules (CRUD)
 * - Service zones (CRUD)
 *
 * Requires owner/admin role (enforced by guard at module level).
 */
@Controller('rides/admin')
export class RidesAdminController {
  constructor(private readonly tenantDb: TenantDbService) {}

  // --- Vehicle Classes ---

  @Get('vehicle-classes')
  async listVehicleClasses(@Req() req: any) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const classes = await db.select().from(schema.vehicleClasses).orderBy(schema.vehicleClasses.sortOrder);
    return { vehicleClasses: classes };
  }

  @Post('vehicle-classes')
  async createVehicleClass(@Req() req: any, @Body() dto: CreateVehicleClassDto) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const [created] = await db
      .insert(schema.vehicleClasses)
      .values({
        name: dto.name,
        iconUrl: dto.iconUrl,
        capacity: dto.capacity,
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();
    return { vehicleClass: created };
  }

  @Patch('vehicle-classes/:id')
  async updateVehicleClass(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleClassDto,
  ) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.iconUrl !== undefined) updateData.iconUrl = dto.iconUrl;
    if (dto.capacity !== undefined) updateData.capacity = dto.capacity;
    if (dto.sortOrder !== undefined) updateData.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) updateData.active = dto.active;

    const [updated] = await db
      .update(schema.vehicleClasses)
      .set(updateData)
      .where(eq(schema.vehicleClasses.id, id))
      .returning();
    return { vehicleClass: updated };
  }

  @Delete('vehicle-classes/:id')
  async deleteVehicleClass(@Req() req: any, @Param('id') id: string) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    await db.update(schema.vehicleClasses).set({ active: false }).where(eq(schema.vehicleClasses.id, id));
    return { success: true };
  }

  // --- Fare Rules ---

  @Get('fare-rules')
  async listFareRules(@Req() req: any) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const rules = await db
      .select({
        id: schema.fareRules.id,
        zoneId: schema.fareRules.zoneId,
        vehicleClassId: schema.fareRules.vehicleClassId,
        baseFare: schema.fareRules.baseFare,
        perKm: schema.fareRules.perKm,
        perMinute: schema.fareRules.perMinute,
        minimumFare: schema.fareRules.minimumFare,
        surgeMultiplier: schema.fareRules.surgeMultiplier,
        currency: schema.fareRules.currency,
        commissionRate: schema.fareRules.commissionRate,
        zoneName: schema.zones.name,
        vehicleClassName: schema.vehicleClasses.name,
      })
      .from(schema.fareRules)
      .innerJoin(schema.zones, eq(schema.fareRules.zoneId, schema.zones.id))
      .innerJoin(schema.vehicleClasses, eq(schema.fareRules.vehicleClassId, schema.vehicleClasses.id));
    return { fareRules: rules };
  }

  @Post('fare-rules')
  async createFareRule(@Req() req: any, @Body() dto: CreateFareRuleDto) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const [created] = await db
      .insert(schema.fareRules)
      .values({
        zoneId: dto.zoneId,
        vehicleClassId: dto.vehicleClassId,
        baseFare: String(dto.baseFare),
        perKm: String(dto.perKm),
        perMinute: String(dto.perMinute),
        minimumFare: String(dto.minimumFare),
        surgeMultiplier: String(dto.surgeMultiplier ?? 1),
        currency: dto.currency ?? 'USD',
        commissionRate: String(dto.commissionRate ?? 0.2),
      })
      .returning();
    return { fareRule: created };
  }

  @Patch('fare-rules/:id')
  async updateFareRule(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFareRuleDto,
  ) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const updateData: Record<string, any> = {};
    if (dto.baseFare !== undefined) updateData.baseFare = String(dto.baseFare);
    if (dto.perKm !== undefined) updateData.perKm = String(dto.perKm);
    if (dto.perMinute !== undefined) updateData.perMinute = String(dto.perMinute);
    if (dto.minimumFare !== undefined) updateData.minimumFare = String(dto.minimumFare);
    if (dto.surgeMultiplier !== undefined) updateData.surgeMultiplier = String(dto.surgeMultiplier);
    if (dto.commissionRate !== undefined) updateData.commissionRate = String(dto.commissionRate);

    const [updated] = await db
      .update(schema.fareRules)
      .set(updateData)
      .where(eq(schema.fareRules.id, id))
      .returning();
    return { fareRule: updated };
  }

  @Delete('fare-rules/:id')
  async deleteFareRule(@Req() req: any, @Param('id') id: string) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    await db.delete(schema.fareRules).where(eq(schema.fareRules.id, id));
    return { success: true };
  }

  // --- Zones ---

  @Get('zones')
  async listZones(@Req() req: any) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const zones = await db.select().from(schema.zones).where(eq(schema.zones.active, true));
    return { zones };
  }

  @Post('zones')
  async createZone(@Req() req: any, @Body() dto: CreateZoneDto) {
    const db = this.tenantDb.getConnection(req.user.tenantId);
    const [created] = await db
      .insert(schema.zones)
      .values({
        name: dto.name,
        boundary: dto.boundary,
      })
      .returning();
    return { zone: created };
  }
}
