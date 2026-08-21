import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ManifestService } from '../services/manifest.service';
import { AssetPipelineService } from '../services/asset-pipeline.service';
import { ConfigSigningService } from '../services/config-signing.service';
import { BuildOrchestrationService } from '../services/build-orchestration.service';
import { DemoService } from '../services/demo.service';
import { KeyProvisioningService } from '../services/key-provisioning.service';
import { SaveManifestDto, TriggerBuildDto, PublishDemoDto, UploadAssetDto } from '../dto/manifest.dto';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { eq } from 'drizzle-orm';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * AppGeneratorController
 *
 * REST API for the app generation pipeline:
 * - Manifest CRUD and versioning
 * - Asset upload and pack generation
 * - Build triggering and status
 * - Demo session management
 * - Signed runtime config delivery
 * - Sound library
 */
@Controller('app-generator')
export class AppGeneratorController {
  constructor(
    private readonly manifestService: ManifestService,
    private readonly assetPipeline: AssetPipelineService,
    private readonly configSigning: ConfigSigningService,
    private readonly buildOrchestration: BuildOrchestrationService,
    private readonly demoService: DemoService,
    private readonly keyProvisioning: KeyProvisioningService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  // --- Manifest ---

  @Post(':surface/manifest')
  async saveManifest(@Req() req: any, @Param('surface') surface: string, @Body() dto: SaveManifestDto) {
    const { tenantId, sub: userId } = req.user;
    dto.surface = surface as any;
    const manifest = await this.manifestService.saveManifest(tenantId, dto, userId);
    return { manifest };
  }

  @Get(':surface/manifest')
  async getManifest(@Req() req: any, @Param('surface') surface: string) {
    const { tenantId } = req.user;
    const manifest = await this.manifestService.getLatest(tenantId, surface);
    return { manifest };
  }

  @Get(':surface/manifest/versions')
  async listManifestVersions(@Req() req: any, @Param('surface') surface: string) {
    const { tenantId } = req.user;
    const versions = await this.manifestService.listVersions(tenantId, surface);
    return { versions };
  }

  @Get(':surface/manifest/:version')
  async getManifestVersion(
    @Req() req: any,
    @Param('surface') surface: string,
    @Param('version') version: string,
  ) {
    const { tenantId } = req.user;
    const manifest = await this.manifestService.getVersion(tenantId, surface, parseInt(version));
    return { manifest };
  }

  @Post(':surface/manifest/diff')
  async diffManifests(
    @Req() req: any,
    @Param('surface') surface: string,
    @Body() body: { oldVersion: number; newVersion: number },
  ) {
    const { tenantId } = req.user;
    const oldManifest = await this.manifestService.getVersion(tenantId, surface, body.oldVersion);
    const newManifest = await this.manifestService.getVersion(tenantId, surface, body.newVersion);
    const diffs = this.manifestService.diffManifests(
      oldManifest.manifest as any,
      newManifest.manifest as any,
    );
    return { diffs };
  }

  // --- Builds ---

  @Post(':surface/builds')
  async triggerBuild(@Req() req: any, @Param('surface') surface: string, @Body() dto: TriggerBuildDto) {
    const { tenantId, sub: userId } = req.user;
    const result = await this.buildOrchestration.triggerBuild(tenantId, surface as any, dto.manifestVersion, userId);
    return result;
  }

  @Get(':surface/builds')
  async listBuilds(@Req() req: any, @Param('surface') surface: string) {
    const { tenantId } = req.user;
    const builds = await this.buildOrchestration.listBuilds(tenantId, surface);
    return { builds };
  }

  @Get(':surface/builds/:id')
  async getBuild(@Req() req: any, @Param('surface') surface: string, @Param('id') buildId: string) {
    const { tenantId } = req.user;
    const build = await this.buildOrchestration.getBuild(tenantId, buildId);
    return { build };
  }

  // --- Demo ---

  @Post('demo')
  async publishDemo(@Req() req: any, @Body() dto: PublishDemoDto) {
    const { tenantId, sub: userId } = req.user;
    const result = await this.demoService.publishDemo(tenantId, dto.surfaces, dto.paired, userId);
    return result;
  }

  @Get('demo')
  async listDemoSessions(@Req() req: any) {
    const { tenantId } = req.user;
    const sessions = await this.demoService.listActiveSessions(tenantId);
    return { sessions };
  }

  @Delete('demo/:id')
  async revokeDemoSession(@Req() req: any, @Param('id') sessionId: string) {
    const { tenantId } = req.user;
    await this.demoService.revokeSession(tenantId, sessionId);
    return { success: true };
  }

  // --- Assets ---

  @Post('assets/upload')
  async uploadAsset(@Req() req: any, @Body() dto: UploadAssetDto) {
    const { tenantId } = req.user;

    // Validate asset (basic — real validation would check actual file metadata)
    const validation = this.assetPipeline.validateAsset(dto.kind, 0);
    // Store asset record
    const db = this.controlPlaneDb.db;
    const [asset] = await db
      .insert(cpSchema.assetRecords)
      .values({
        tenantId,
        kind: dto.kind,
        surfaceVariant: dto.surfaceVariant || 'shared',
        originalUrl: dto.url,
        originalHash: dto.hash,
        moderationStatus: 'approved', // In production: async moderation
        rightsDeclaration: dto.rightsDeclaration || false,
      })
      .returning();

    return { asset };
  }

  @Post('assets/pack')
  async generatePack(@Req() req: any, @Body() body: any) {
    const { tenantId } = req.user;
    const packHash = await this.assetPipeline.queuePackGeneration({
      tenantId,
      surface: body.surface || 'customer',
      assets: body.assets,
      theme: body.theme,
    });
    return { packHash, status: 'queued' };
  }

  @Get('assets')
  async listAssets(@Req() req: any) {
    const { tenantId } = req.user;
    const db = this.controlPlaneDb.db;
    const assets = await db
      .select()
      .from(cpSchema.assetRecords)
      .where(eq(cpSchema.assetRecords.tenantId, tenantId));
    return { assets };
  }

  // --- Sounds ---

  @Get('sounds/library')
  async getSoundLibrary(@Query('event') eventType?: string) {
    const db = this.controlPlaneDb.db;
    const sounds = await db.select().from(cpSchema.soundLibrary);
    if (eventType) return { sounds: sounds.filter((s) => s.eventType === eventType) };
    return { sounds };
  }

  // --- Keys ---

  @Get('keys')
  async getKeyGrants(@Req() req: any, @Query('environment') environment?: string) {
    const { tenantId } = req.user;
    const grants = await this.keyProvisioning.getGrants(tenantId, environment || 'production');
    return { grants };
  }
}

/**
 * Public config endpoint (no auth — apps verify via JWS signature).
 */
@Controller('v1')
export class ConfigController {
  constructor(private readonly configSigning: ConfigSigningService) {}

  @Get(':tenant/:surface/:environment/config')
  async getConfig(
    @Param('tenant') tenantId: string,
    @Param('surface') surface: string,
    @Param('environment') environment: string,
  ) {
    const signedConfig = await this.configSigning.generateSignedConfig(
      tenantId,
      surface as any,
      environment as any,
    );
    return { config: signedConfig };
  }
}

/**
 * Internal webhook handler for EAS build/submit status.
 */
@Controller('internal/webhooks')
export class EasWebhookController {
  constructor(private readonly buildOrchestration: BuildOrchestrationService) {}

  @Post('eas')
  async handleEasWebhook(@Body() body: any) {
    // In production: verify EAS webhook signature
    const { buildId, status, artifacts, error } = body;
    await this.buildOrchestration.handleBuildWebhook(buildId, status, artifacts, error);
    return { received: true };
  }
}
