import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, desc } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import { ManifestService } from './manifest.service';
import { KeyProvisioningService } from './key-provisioning.service';
import { ConfigSigningService } from './config-signing.service';

/**
 * Build status transitions.
 */
export type BuildStatus = 'queued' | 'building' | 'succeeded' | 'failed';

/**
 * BuildOrchestrationService
 *
 * Orchestrates the end-to-end app build pipeline:
 * 1. Validate (Scale tier, build quota, manifest completeness)
 * 2. Create app_builds record
 * 3. Resolve manifest, asset pack, codebase SHA
 * 4. Ensure EAS project exists
 * 5. Ensure credentials and key grants
 * 6. Trigger EAS Build (would call EAS CLI/API in production)
 * 7. Track status via webhooks
 * 8. On success: attach artifacts, write usage record
 *
 * This service handles the orchestration logic. The actual EAS API
 * calls are stubbed for the platform implementation; in production
 * they would use the @expo/eas-client SDK.
 */
@Injectable()
export class BuildOrchestrationService {
  private readonly logger = new Logger(BuildOrchestrationService.name);

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly manifestService: ManifestService,
    private readonly keyProvisioning: KeyProvisioningService,
    private readonly configSigning: ConfigSigningService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Trigger a new build for a tenant/surface.
   */
  async triggerBuild(
    tenantId: string,
    surface: 'customer' | 'provider',
    manifestVersion?: number,
    triggeredBy?: string,
  ) {
    const db = this.controlPlaneDb.db;

    // 1. Validate tenant is Scale tier
    const [tenant] = await db
      .select()
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new BadRequestException('Tenant not found');
    if (tenant.tier !== 'scale') {
      throw new BadRequestException('App generation requires Scale tier');
    }

    // 2. Resolve manifest
    const manifest = manifestVersion
      ? await this.manifestService.getVersion(tenantId, surface, manifestVersion)
      : await this.manifestService.getLatest(tenantId, surface);

    if (!manifest) {
      throw new BadRequestException('No manifest found. Complete the build wizard first.');
    }

    // 3. Ensure app project exists
    const appProject = await this.ensureAppProject(tenantId, surface, manifest.manifest as any);

    // 4. Provision keys
    const bundleId = (manifest.manifest as any)?.identity?.bundleId || `com.platform.t.${tenant.slug}`;
    await this.keyProvisioning.provisionKeys(
      tenantId,
      appProject.id,
      bundleId,
      'production',
    );

    // 5. Create build record
    const codebaseSha = 'latest'; // In production: resolved from codebase release
    const channel = `${tenant.slug}-${surface}-production`;

    const [build] = await db
      .insert(cpSchema.appBuilds)
      .values({
        tenantId,
        platform: 'ios' as any, // Both platforms triggered together
        status: 'queued',
        config: {
          surface,
          manifestVersion: manifest.version,
          codebaseSha,
          channel,
          bundleId,
          assetPackHash: manifest.assetPackHash,
        },
        triggeredBy,
      })
      .returning();

    // 6. In production: trigger EAS Build via API
    // await this.triggerEasBuild(build.id, manifest, appProject, channel);

    this.logger.log(
      `Build triggered: id=${build.id} tenant=${tenantId} surface=${surface} manifestV=${manifest.version}`,
    );

    this.eventEmitter.emit('app_build.queued', {
      tenantId,
      buildId: build.id,
      surface,
      manifestVersion: manifest.version,
    });

    return {
      buildId: build.id,
      status: 'queued',
      surface,
      manifestVersion: manifest.version,
      channel,
    };
  }

  /**
   * Handle EAS webhook for build status update.
   */
  async handleBuildWebhook(
    buildId: string,
    status: 'building' | 'succeeded' | 'failed',
    artifacts?: { ios?: string; android?: string },
    errorMessage?: string,
  ) {
    const db = this.controlPlaneDb.db;

    const updateData: Record<string, any> = { status };
    if (artifacts) updateData.config = { artifacts };
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === 'succeeded' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    await db
      .update(cpSchema.appBuilds)
      .set(updateData)
      .where(eq(cpSchema.appBuilds.id, buildId));

    const eventName = status === 'succeeded' ? 'app_build.built' : status === 'failed' ? 'app_build.failed' : 'app_build.building';
    this.eventEmitter.emit(eventName, { buildId, status, artifacts });

    this.logger.log(`Build status updated: id=${buildId} status=${status}`);
  }

  /**
   * Get build status and details.
   */
  async getBuild(tenantId: string, buildId: string) {
    const db = this.controlPlaneDb.db;
    const [build] = await db
      .select()
      .from(cpSchema.appBuilds)
      .where(and(eq(cpSchema.appBuilds.id, buildId), eq(cpSchema.appBuilds.tenantId, tenantId)))
      .limit(1);
    return build || null;
  }

  /**
   * List builds for a tenant/surface.
   */
  async listBuilds(tenantId: string, surface?: string) {
    const db = this.controlPlaneDb.db;
    const builds = await db
      .select()
      .from(cpSchema.appBuilds)
      .where(eq(cpSchema.appBuilds.tenantId, tenantId))
      .orderBy(desc(cpSchema.appBuilds.createdAt));

    if (surface) {
      return builds.filter((b) => (b.config as any)?.surface === surface);
    }
    return builds;
  }

  /**
   * Ensure an app project record exists for this tenant/surface.
   */
  private async ensureAppProject(
    tenantId: string,
    surface: 'customer' | 'provider',
    manifestData: any,
  ) {
    const db = this.controlPlaneDb.db;

    const [existing] = await db
      .select()
      .from(cpSchema.appProjects)
      .where(and(
        eq(cpSchema.appProjects.tenantId, tenantId),
        eq(cpSchema.appProjects.surface, surface),
      ))
      .limit(1);

    if (existing) return existing;

    const bundleId = manifestData?.identity?.bundleId || `com.platform.${surface === 'customer' ? 't' : 'p'}.unknown`;

    const [project] = await db
      .insert(cpSchema.appProjects)
      .values({
        tenantId,
        surface,
        platform: 'ios', // Both platforms share one project in EAS
        bundleId,
        credentialMode: manifestData?.identity?.developerAccountMode || 'platform_managed',
      })
      .returning();

    this.logger.log(`App project created: tenant=${tenantId} surface=${surface} bundle=${bundleId}`);
    return project;
  }
}
