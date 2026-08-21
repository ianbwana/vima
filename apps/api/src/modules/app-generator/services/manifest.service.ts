import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';
import { SaveManifestDto, BuildManifestDocument } from '../dto/manifest.dto';
import { EntitlementsService } from '../../entitlements/entitlements.service';

/**
 * Change classification for manifest diffs.
 */
export interface ManifestDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  requiresRebuild: boolean;
}

/** Fields that require a new binary build when changed. */
const REBUILD_FIELDS = new Set([
  'identity.appName',
  'identity.bundleId',
  'identity.deepLinkDomain',
  'assets.iconHash',
  'assets.splashHash',
  'assets.providerIconHash',
  'assets.notificationIconHash',
  'assets.assetPackHash',
  'sounds',
  'features.locales',
  'endpoints.platformPublicKey',
]);

/**
 * ManifestService
 *
 * Manages build manifests — the immutable, versioned JSON documents that
 * describe everything a build needs for one surface.
 *
 * Responsibilities:
 * - Save/update manifest drafts (validation + entitlement cross-check)
 * - Version management (each save increments, immutable once built)
 * - Diff computation (classify changes as rebuild vs runtime-updatable)
 * - Retrieve manifests by version for build workers
 */
@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name);

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  /**
   * Save a manifest draft. Creates a new version.
   * Validates entitlements and required fields.
   */
  async saveManifest(tenantId: string, dto: SaveManifestDto, userId?: string): Promise<any> {
    // Validate entitlements
    await this.validateEntitlements(tenantId, dto);

    // Validate required fields
    this.validateManifestFields(dto);

    const db = this.controlPlaneDb.db;

    // Get current max version
    const [latest] = await db
      .select({ version: cpSchema.buildManifests.version })
      .from(cpSchema.buildManifests)
      .where(and(
        eq(cpSchema.buildManifests.tenantId, tenantId),
        eq(cpSchema.buildManifests.surface, dto.surface),
      ))
      .orderBy(desc(cpSchema.buildManifests.version))
      .limit(1);

    const nextVersion = (latest?.version ?? 0) + 1;

    // Build the full manifest document
    const manifest: BuildManifestDocument = {
      version: nextVersion,
      surface: dto.surface,
      identity: dto.identity,
      features: dto.features,
      theme: dto.theme,
      assets: dto.assets,
      sounds: dto.sounds,
      endpoints: {
        configUrl: `https://config.platform.app/v1/${tenantId}/${dto.surface}/${dto.identity.defaultEnvironment}`,
        bakedBinding: {
          tenantId,
          surface: dto.surface,
          environment: dto.identity.defaultEnvironment,
        },
        platformPublicKey: '', // Resolved at build time from KMS
      },
      keyGrants: {}, // Resolved at build time by KeyProvisioningService
      storeListing: dto.storeListing,
    };

    // Persist
    const [saved] = await db
      .insert(cpSchema.buildManifests)
      .values({
        tenantId,
        surface: dto.surface,
        version: nextVersion,
        manifest: manifest as any,
        assetPackHash: dto.assets.assetPackHash,
        createdBy: userId,
      })
      .returning();

    this.logger.log(`Manifest saved: tenant=${tenantId} surface=${dto.surface} version=${nextVersion}`);
    return saved;
  }

  /**
   * Get the latest manifest for a tenant/surface.
   */
  async getLatest(tenantId: string, surface: string) {
    const db = this.controlPlaneDb.db;
    const [manifest] = await db
      .select()
      .from(cpSchema.buildManifests)
      .where(and(
        eq(cpSchema.buildManifests.tenantId, tenantId),
        eq(cpSchema.buildManifests.surface, surface as any),
      ))
      .orderBy(desc(cpSchema.buildManifests.version))
      .limit(1);
    return manifest || null;
  }

  /**
   * Get a specific manifest version.
   */
  async getVersion(tenantId: string, surface: string, version: number) {
    const db = this.controlPlaneDb.db;
    const [manifest] = await db
      .select()
      .from(cpSchema.buildManifests)
      .where(and(
        eq(cpSchema.buildManifests.tenantId, tenantId),
        eq(cpSchema.buildManifests.surface, surface as any),
        eq(cpSchema.buildManifests.version, version),
      ))
      .limit(1);
    if (!manifest) throw new NotFoundException('Manifest version not found');
    return manifest;
  }

  /**
   * List all manifest versions for a tenant/surface.
   */
  async listVersions(tenantId: string, surface: string) {
    const db = this.controlPlaneDb.db;
    return db
      .select()
      .from(cpSchema.buildManifests)
      .where(and(
        eq(cpSchema.buildManifests.tenantId, tenantId),
        eq(cpSchema.buildManifests.surface, surface as any),
      ))
      .orderBy(desc(cpSchema.buildManifests.version));
  }

  /**
   * Compute diff between two manifest versions.
   * Classifies each change as "requires rebuild" or "runtime-updatable".
   */
  diffManifests(oldManifest: BuildManifestDocument, newManifest: BuildManifestDocument): ManifestDiff[] {
    const diffs: ManifestDiff[] = [];

    const flatOld = this.flattenObject(oldManifest, '');
    const flatNew = this.flattenObject(newManifest, '');

    const allKeys = new Set([...Object.keys(flatOld), ...Object.keys(flatNew)]);

    for (const key of allKeys) {
      const oldVal = flatOld[key];
      const newVal = flatNew[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        const requiresRebuild = REBUILD_FIELDS.has(key) ||
          [...REBUILD_FIELDS].some((f) => key.startsWith(f));

        diffs.push({ field: key, oldValue: oldVal, newValue: newVal, requiresRebuild });
      }
    }

    return diffs;
  }

  /**
   * Validate that requested modules are entitled.
   */
  private async validateEntitlements(tenantId: string, dto: SaveManifestDto): Promise<void> {
    for (const module of dto.features.enabledModules) {
      const hasAccess = await this.entitlementsService.checkModuleAccess(tenantId, module);
      if (!hasAccess) {
        throw new BadRequestException(
          `Module "${module}" is not entitled for this tenant. Cannot include in manifest.`,
        );
      }
    }
  }

  /**
   * Validate required manifest fields.
   */
  private validateManifestFields(dto: SaveManifestDto): void {
    if (!dto.identity.appName || dto.identity.appName.length < 2 || dto.identity.appName.length > 30) {
      throw new BadRequestException('App name must be 2-30 characters');
    }

    if (!dto.identity.bundleId) {
      throw new BadRequestException('Bundle ID is required');
    }

    if (dto.features.enabledModules.length === 0 && dto.surface === 'customer') {
      throw new BadRequestException('Customer app must have at least one enabled module');
    }

    if (!dto.theme.colors?.primary || !dto.theme.colors?.onPrimary) {
      throw new BadRequestException('Theme must include primary and onPrimary colors');
    }

    if (!dto.theme.typography?.fontFamily) {
      throw new BadRequestException('Theme must include a font family');
    }

    // Provider surface: job offer ringtone must be audible
    if (dto.surface === 'provider') {
      const jobOfferSound = dto.sounds.events['job_offer'];
      if (!jobOfferSound || !jobOfferSound.id) {
        throw new BadRequestException('Provider app must have an audible job-offer ringtone');
      }
    }
  }

  private flattenObject(obj: any, prefix: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, path));
      } else {
        result[path] = value;
      }
    }
    return result;
  }
}
