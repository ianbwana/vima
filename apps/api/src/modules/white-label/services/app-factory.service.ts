import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import { ThemeService } from './theme.service';

/**
 * Build configuration for the app factory pipeline.
 */
export interface AppBuildConfig {
  bundleId: string;
  appName: string;
  platform: 'ios' | 'android';
  themeTokens: Record<string, unknown>;
  enabledModules: string[];
  apiBase: string;
  signingType: 'platform' | 'tenant';
}

/**
 * AppFactoryService
 *
 * Manages the app factory pipeline for Scale-tier tenants.
 * Generates dedicated native app builds (AAB + IPA) from tenant config.
 *
 * Pipeline:
 * 1. Read tenant config: bundle ID, name, theme tokens, modules, API base
 * 2. Generate asset pack from uploaded logos (all required sizes)
 * 3. Trigger CI build (Codemagic) with config via flavor/dart-define
 * 4. Track build status (queued → building → succeeded/failed)
 * 5. Store artifact URL for portal download
 *
 * In production, this would call Codemagic's API. For now, it manages
 * state and provides the build trigger/status interface.
 */
@Injectable()
export class AppFactoryService {
  private readonly logger = new Logger(AppFactoryService.name);

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly themeService: ThemeService,
  ) {}

  /**
   * Trigger a new app build for a tenant.
   */
  async triggerBuild(
    tenantId: string,
    platform: 'ios' | 'android',
    config?: Record<string, unknown>,
    triggeredBy?: string,
  ) {
    const db = this.controlPlaneDb.db;

    // Get tenant info
    const [tenant] = await db
      .select()
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) throw new BadRequestException('Tenant not found');

    // Verify tenant is on Scale tier
    if (tenant.tier !== 'scale') {
      throw new BadRequestException('App factory is only available for Scale tier tenants');
    }

    // Get published theme
    const theme = await this.themeService.getPublishedTheme(tenantId);

    // Build the configuration
    const buildConfig: AppBuildConfig = {
      bundleId: config?.bundleId as string || `app.vima.${tenant.slug}.${platform}`,
      appName: (theme?.copy?.appName || tenant.name) as string,
      platform,
      themeTokens: (theme || {}) as Record<string, unknown>,
      enabledModules: (tenant.enabledModules as string[]) || [],
      apiBase: `https://${tenant.slug}.vima.app/api`,
      signingType: (config?.signingType as 'platform' | 'tenant') || 'platform',
    };

    // Create build record
    const [build] = await db
      .insert(cpSchema.appBuilds)
      .values({
        tenantId,
        platform,
        status: 'queued',
        config: buildConfig as any,
        triggeredBy,
      })
      .returning();

    // In production: trigger Codemagic API with buildConfig
    // await this.triggerCodemagicBuild(build.id, buildConfig);

    this.logger.log(`App build triggered: id=${build.id} tenant=${tenantId} platform=${platform}`);
    return build;
  }

  /**
   * Get build status for a specific build.
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
   * List all builds for a tenant.
   */
  async listBuilds(tenantId: string) {
    const db = this.controlPlaneDb.db;
    return db
      .select()
      .from(cpSchema.appBuilds)
      .where(eq(cpSchema.appBuilds.tenantId, tenantId))
      .orderBy(desc(cpSchema.appBuilds.createdAt));
  }

  /**
   * Update build status (called by CI webhook or polling).
   */
  async updateBuildStatus(
    buildId: string,
    status: 'building' | 'succeeded' | 'failed',
    artifactUrl?: string,
    errorMessage?: string,
  ) {
    const db = this.controlPlaneDb.db;

    const updateData: Record<string, any> = { status };
    if (artifactUrl) updateData.artifactUrl = artifactUrl;
    if (errorMessage) updateData.errorMessage = errorMessage;
    if (status === 'succeeded' || status === 'failed') {
      updateData.completedAt = new Date();
    }

    const [build] = await db
      .update(cpSchema.appBuilds)
      .set(updateData)
      .where(eq(cpSchema.appBuilds.id, buildId))
      .returning();

    this.logger.log(`Build status updated: id=${buildId} status=${status}`);
    return build;
  }
}
