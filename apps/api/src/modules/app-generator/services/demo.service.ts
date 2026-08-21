import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import { ManifestService } from './manifest.service';

/**
 * DemoService
 *
 * Manages demo sessions for the "Try it" wizard step.
 * Allows tenants to hold functional, branded demos on real devices
 * before any store build exists.
 *
 * Features:
 * - Publish demo sessions per surface (customer, provider, or both paired)
 * - Cohort pairing: customer + provider demos share a cohort ID for
 *   the two-device demo (dispatch routes demand within cohort)
 * - Session lifecycle: create, extend, revoke, auto-expire (14 days)
 * - Rate limiting: demo publishes per tenant per day capped
 * - Sandbox data seeding references (demo accounts, merchants, zones)
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  /** Default demo session expiry: 14 days */
  private static readonly DEFAULT_EXPIRY_DAYS = 14;
  /** Max demo publishes per tenant per day */
  private static readonly MAX_PUBLISHES_PER_DAY = 10;

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly manifestService: ManifestService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Publish demo sessions for one or both surfaces.
   * If paired=true, creates a shared cohort for two-device demo.
   */
  async publishDemo(
    tenantId: string,
    surfaces: Array<'customer' | 'provider'>,
    paired: boolean = false,
    createdBy?: string,
  ) {
    const db = this.controlPlaneDb.db;

    // Rate limit check
    await this.checkRateLimit(tenantId);

    // Get tenant info
    const [tenant] = await db
      .select()
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new BadRequestException('Tenant not found');

    const cohortId = paired && surfaces.length > 1 ? randomUUID() : null;
    const expiresAt = new Date(Date.now() + DemoService.DEFAULT_EXPIRY_DAYS * 86400000);
    const sessions: any[] = [];

    for (const surface of surfaces) {
      // Get latest manifest draft for this surface
      const manifest = await this.manifestService.getLatest(tenantId, surface);
      const manifestVersion = manifest?.version || 0;

      // Channel naming: {slug}-{surface}-demo
      const channel = `${tenant.slug}-${surface}-demo`;

      // In production: publish EAS Update to the channel
      // const easUpdateId = await this.publishEasUpdate(channel, manifest);
      const easUpdateId = `demo_${tenantId.slice(0, 8)}_${surface}_${Date.now()}`;

      const [session] = await db
        .insert(cpSchema.demoSessions)
        .values({
          tenantId,
          surface,
          cohortId,
          manifestDraftVersion: manifestVersion,
          channel,
          easUpdateId,
          createdBy,
          expiresAt,
        })
        .returning();

      sessions.push(session);

      this.eventEmitter.emit('demo_session.published', {
        tenantId,
        sessionId: session.id,
        surface,
        cohortId,
        channel,
      });
    }

    this.logger.log(
      `Demo published: tenant=${tenantId} surfaces=${surfaces.join(',')} paired=${paired} cohort=${cohortId}`,
    );

    return {
      sessions,
      cohortId,
      expiresAt,
      qrCodes: sessions.map((s) => ({
        surface: s.surface,
        previewShellUrl: `vima://demo/${tenant.slug}/${s.surface}?session=${s.id}`,
        expoGoUrl: `exp://demo.platform.app/${tenant.slug}/${s.surface}`,
      })),
    };
  }

  /**
   * Revoke a demo session.
   */
  async revokeSession(tenantId: string, sessionId: string): Promise<void> {
    const db = this.controlPlaneDb.db;
    await db
      .update(cpSchema.demoSessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(cpSchema.demoSessions.id, sessionId),
        eq(cpSchema.demoSessions.tenantId, tenantId),
      ));
    this.logger.log(`Demo session revoked: ${sessionId}`);
  }

  /**
   * List active demo sessions for a tenant.
   */
  async listActiveSessions(tenantId: string) {
    const db = this.controlPlaneDb.db;
    const now = new Date();

    return db
      .select()
      .from(cpSchema.demoSessions)
      .where(and(
        eq(cpSchema.demoSessions.tenantId, tenantId),
        gt(cpSchema.demoSessions.expiresAt, now),
        isNull(cpSchema.demoSessions.revokedAt),
      ));
  }

  /**
   * Check if a demo session is still valid (not expired, not revoked).
   * Used by the config endpoint to decide whether to serve demo config.
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    const db = this.controlPlaneDb.db;
    const [session] = await db
      .select()
      .from(cpSchema.demoSessions)
      .where(eq(cpSchema.demoSessions.id, sessionId))
      .limit(1);

    if (!session) return false;
    if (session.revokedAt) return false;
    if (new Date() > session.expiresAt) return false;
    return true;
  }

  /**
   * Extend a demo session's expiry.
   */
  async extendSession(tenantId: string, sessionId: string, additionalDays: number = 14): Promise<void> {
    const db = this.controlPlaneDb.db;
    const [session] = await db
      .select()
      .from(cpSchema.demoSessions)
      .where(and(
        eq(cpSchema.demoSessions.id, sessionId),
        eq(cpSchema.demoSessions.tenantId, tenantId),
      ))
      .limit(1);

    if (!session) throw new BadRequestException('Session not found');

    const newExpiry = new Date(Math.max(
      session.expiresAt.getTime(),
      Date.now(),
    ) + additionalDays * 86400000);

    await db
      .update(cpSchema.demoSessions)
      .set({ expiresAt: newExpiry })
      .where(eq(cpSchema.demoSessions.id, sessionId));
  }

  /**
   * Rate limit: max N publishes per tenant per day.
   */
  private async checkRateLimit(tenantId: string): Promise<void> {
    const db = this.controlPlaneDb.db;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySessions = await db
      .select()
      .from(cpSchema.demoSessions)
      .where(and(
        eq(cpSchema.demoSessions.tenantId, tenantId),
        gt(cpSchema.demoSessions.createdAt, todayStart),
      ));

    if (todaySessions.length >= DemoService.MAX_PUBLISHES_PER_DAY) {
      throw new BadRequestException(
        `Demo publish limit reached (${DemoService.MAX_PUBLISHES_PER_DAY}/day). Try again tomorrow.`,
      );
    }
  }
}
