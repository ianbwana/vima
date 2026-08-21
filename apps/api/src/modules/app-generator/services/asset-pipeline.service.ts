import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { eq, and } from 'drizzle-orm';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * Asset pack job data.
 */
export interface AssetPackJobData {
  tenantId: string;
  surface: 'customer' | 'provider';
  assets: {
    iconUrl: string;
    splashUrl?: string;
    notificationIconUrl?: string;
    onboardingUrls: string[];
    logoUrl?: string;
  };
  theme: {
    primaryColor: string;
    backgroundColor: string;
    secondaryColor?: string;
  };
}

/**
 * Generated asset pack manifest.
 */
export interface AssetPackManifest {
  packHash: string;
  icons: {
    ios: Record<string, string>; // size → hash
    android: { foreground: string; background: string; adaptiveHash: string };
    maskable: string;
  };
  splash: {
    light: string;
    dark: string;
    android12: string;
  };
  notificationIcon?: string;
  onboarding: string[];
  providerVariant?: {
    iconHash: string;
    splashHash: string;
  };
}

/**
 * AssetPipelineService
 *
 * Orchestrates asset transformation for app builds.
 * Turns tenant uploads + theme tokens into content-addressed asset packs.
 *
 * Steps:
 * 1. Fetch originals from object storage
 * 2. Validate (dimensions, format, file size, sRGB)
 * 3. Transform (icons, splash, provider variants, sounds)
 * 4. Content-address everything (SHA-256)
 * 5. Store pack, emit manifest
 *
 * Idempotent: same inputs → same pack hash.
 */
@Injectable()
export class AssetPipelineService {
  private readonly logger = new Logger(AssetPipelineService.name);

  constructor(
    @InjectQueue('asset-pack') private readonly assetPackQueue: Queue,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  /**
   * Queue an asset pack generation job.
   */
  async queuePackGeneration(data: AssetPackJobData): Promise<string> {
    const inputHash = this.computeInputHash(data);

    // Check if we already have this pack (idempotent)
    const existing = await this.findExistingPack(data.tenantId, inputHash);
    if (existing) {
      this.logger.log(`Asset pack already exists: hash=${inputHash} tenant=${data.tenantId}`);
      return inputHash;
    }

    const job = await this.assetPackQueue.add('generate', data, {
      jobId: `asset-pack-${data.tenantId}-${data.surface}-${inputHash}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Asset pack queued: tenant=${data.tenantId} surface=${data.surface} jobId=${job.id}`);
    return inputHash;
  }

  /**
   * Validate an uploaded asset.
   * Returns validation result with actionable error messages.
   */
  validateAsset(
    kind: string,
    fileSize: number,
    width?: number,
    height?: number,
    format?: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (kind) {
      case 'icon':
        if (width !== 1024 || height !== 1024) {
          errors.push('App icon must be exactly 1024x1024 pixels');
        }
        if (format && !['png'].includes(format.toLowerCase())) {
          errors.push('App icon must be PNG format');
        }
        if (fileSize > 5 * 1024 * 1024) {
          errors.push('App icon must be under 5MB');
        }
        break;

      case 'logo':
        if ((width || 0) < 1024 || (height || 0) < 1024) {
          errors.push('Logo must be at least 1024x1024 pixels');
        }
        if (format && !['png', 'svg'].includes(format.toLowerCase())) {
          errors.push('Logo must be PNG or SVG format');
        }
        break;

      case 'splash':
        if ((width || 0) < 1024 || (height || 0) < 1024) {
          errors.push('Splash image must be at least 1024x1024 pixels');
        }
        break;

      case 'sound':
        if (fileSize > 1024 * 1024) {
          errors.push('Sound file must be under 1MB');
        }
        if (format && !['wav', 'mp3'].includes(format.toLowerCase())) {
          errors.push('Sound must be WAV or MP3 format');
        }
        break;

      case 'onboarding':
        if (fileSize > 3 * 1024 * 1024) {
          errors.push('Onboarding image must be under 3MB');
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate the iOS icon set sizes from a 1024x1024 source.
   * Returns the set of sizes needed.
   */
  getIosIconSizes(): Array<{ size: number; scale: number; filename: string }> {
    return [
      { size: 20, scale: 2, filename: 'icon-20@2x.png' },
      { size: 20, scale: 3, filename: 'icon-20@3x.png' },
      { size: 29, scale: 2, filename: 'icon-29@2x.png' },
      { size: 29, scale: 3, filename: 'icon-29@3x.png' },
      { size: 40, scale: 2, filename: 'icon-40@2x.png' },
      { size: 40, scale: 3, filename: 'icon-40@3x.png' },
      { size: 60, scale: 2, filename: 'icon-60@2x.png' },
      { size: 60, scale: 3, filename: 'icon-60@3x.png' },
      { size: 76, scale: 2, filename: 'icon-76@2x.png' },
      { size: 83.5, scale: 2, filename: 'icon-83.5@2x.png' },
      { size: 1024, scale: 1, filename: 'icon-1024.png' },
    ];
  }

  /**
   * Compute a deterministic hash from the input data for idempotency.
   */
  computeInputHash(data: AssetPackJobData): string {
    const canonical = JSON.stringify({
      tenantId: data.tenantId,
      surface: data.surface,
      assets: data.assets,
      theme: data.theme,
    });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  /**
   * Check if an asset pack with this hash already exists.
   */
  private async findExistingPack(tenantId: string, packHash: string) {
    const db = this.controlPlaneDb.db;
    const [existing] = await db
      .select()
      .from(cpSchema.assetRecords)
      .where(and(
        eq(cpSchema.assetRecords.tenantId, tenantId),
        eq(cpSchema.assetRecords.packHash, packHash),
      ))
      .limit(1);
    return existing || null;
  }
}

/**
 * BullMQ processor for asset pack generation.
 */
@Processor('asset-pack', { concurrency: 3 })
export class AssetPackProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetPackProcessor.name);

  constructor(private readonly controlPlaneDb: ControlPlaneDbService) {
    super();
  }

  async process(job: Job<AssetPackJobData>): Promise<AssetPackManifest> {
    const { tenantId, surface, assets, theme } = job.data;

    this.logger.log(`Processing asset pack: tenant=${tenantId} surface=${surface}`);

    // In production: fetch images from object storage, use sharp to resize,
    // generate iOS icon set, Android adaptive icon, splash variants,
    // provider distinct variant, hash everything, store results.
    //
    // For now, generate a deterministic pack manifest from the inputs.

    const packHash = createHash('sha256')
      .update(JSON.stringify(job.data))
      .digest('hex')
      .slice(0, 16);

    const iconHash = createHash('sha256').update(assets.iconUrl || '').digest('hex').slice(0, 16);
    const splashHash = createHash('sha256').update(assets.splashUrl || assets.iconUrl || '').digest('hex').slice(0, 16);

    const manifest: AssetPackManifest = {
      packHash,
      icons: {
        ios: { '1024': iconHash },
        android: {
          foreground: iconHash,
          background: theme.primaryColor,
          adaptiveHash: iconHash,
        },
        maskable: iconHash,
      },
      splash: {
        light: splashHash,
        dark: splashHash,
        android12: splashHash,
      },
      notificationIcon: assets.notificationIconUrl
        ? createHash('sha256').update(assets.notificationIconUrl).digest('hex').slice(0, 16)
        : undefined,
      onboarding: assets.onboardingUrls.map((url) =>
        createHash('sha256').update(url).digest('hex').slice(0, 16),
      ),
    };

    // Generate provider variant (distinct icon treatment)
    if (surface === 'provider' || true) {
      manifest.providerVariant = {
        iconHash: createHash('sha256').update(iconHash + '-provider').digest('hex').slice(0, 16),
        splashHash: createHash('sha256').update(splashHash + '-provider').digest('hex').slice(0, 16),
      };
    }

    // Store the pack record
    const db = this.controlPlaneDb.db;
    await db.insert(cpSchema.assetRecords).values({
      tenantId,
      kind: 'pack',
      surfaceVariant: surface,
      originalUrl: assets.iconUrl || '',
      originalHash: iconHash,
      packHash,
      moderationStatus: 'approved',
      metadata: manifest as any,
    });

    this.logger.log(`Asset pack generated: tenant=${tenantId} packHash=${packHash}`);
    return manifest;
  }
}
