import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ThemeService } from '../services/theme.service';
import { PwaService } from '../services/pwa.service';
import { CustomDomainService } from '../services/custom-domain.service';
import { AppFactoryService } from '../services/app-factory.service';
import { SaveThemeDto, AddDomainDto, TriggerBuildDto, UploadAssetDto } from '../dto/white-label.dto';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { eq } from 'drizzle-orm';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * WhiteLabelController
 *
 * Unified controller for all white-label features:
 * - Theme management (save, publish, preview)
 * - PWA manifest generation
 * - Custom domain management
 * - App factory builds
 * - Asset uploads
 */
@Controller('white-label')
export class WhiteLabelController {
  constructor(
    private readonly themeService: ThemeService,
    private readonly pwaService: PwaService,
    private readonly domainService: CustomDomainService,
    private readonly appFactory: AppFactoryService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  // --- Theme ---

  @Post('theme')
  async saveTheme(@Req() req: any, @Body() dto: SaveThemeDto) {
    const { tenantId } = req.user;
    const theme = await this.themeService.saveTheme(tenantId, dto.tokens, dto.publish);
    return { theme };
  }

  @Get('theme')
  async getTheme(@Req() req: any) {
    const { tenantId } = req.user;
    const theme = await this.themeService.getLatestTheme(tenantId);
    return { theme };
  }

  @Get('theme/published')
  async getPublishedTheme(@Req() req: any) {
    const { tenantId } = req.user;
    const tokens = await this.themeService.getPublishedTheme(tenantId);
    return { tokens };
  }

  @Post('theme/:id/publish')
  async publishTheme(@Req() req: any, @Param('id') themeId: string) {
    const { tenantId } = req.user;
    const theme = await this.themeService.publishTheme(tenantId, themeId);
    return { theme };
  }

  @Get('theme/versions')
  async listThemeVersions(@Req() req: any) {
    const { tenantId } = req.user;
    const versions = await this.themeService.listThemeVersions(tenantId);
    return { versions };
  }

  @Get('theme/css')
  async getThemeCss(@Req() req: any) {
    const { tenantId } = req.user;
    const tokens = await this.themeService.getPublishedTheme(tenantId);
    if (!tokens) return { css: '' };
    const css = this.pwaService.generateCssVariables(tokens);
    return { css };
  }

  // --- PWA ---

  @Get('pwa/manifest')
  async getManifest(@Req() req: any) {
    const { tenantId } = req.user;
    const manifest = await this.pwaService.generateManifest(tenantId);
    return manifest;
  }

  @Get('pwa/sw-config')
  async getServiceWorkerConfig(@Req() req: any) {
    const { tenantId } = req.user;
    return this.pwaService.getServiceWorkerConfig(tenantId);
  }

  // --- Custom Domains ---

  @Post('domains')
  async addDomain(@Req() req: any, @Body() dto: AddDomainDto) {
    const { tenantId } = req.user;
    const result = await this.domainService.addDomain(tenantId, dto.domain);
    return result;
  }

  @Get('domains')
  async listDomains(@Req() req: any) {
    const { tenantId } = req.user;
    const domains = await this.domainService.listDomains(tenantId);
    return { domains };
  }

  @Post('domains/:id/verify')
  async verifyDomain(@Req() req: any, @Param('id') domainId: string) {
    const { tenantId } = req.user;
    const result = await this.domainService.verifyDomain(tenantId, domainId);
    return result;
  }

  @Delete('domains/:id')
  async removeDomain(@Req() req: any, @Param('id') domainId: string) {
    const { tenantId } = req.user;
    await this.domainService.removeDomain(tenantId, domainId);
    return { success: true };
  }

  // --- App Factory ---

  @Post('builds')
  async triggerBuild(@Req() req: any, @Body() dto: TriggerBuildDto) {
    const { tenantId, sub: userId } = req.user;
    const build = await this.appFactory.triggerBuild(tenantId, dto.platform, dto.config, userId);
    return { build };
  }

  @Get('builds')
  async listBuilds(@Req() req: any) {
    const { tenantId } = req.user;
    const builds = await this.appFactory.listBuilds(tenantId);
    return { builds };
  }

  @Get('builds/:id')
  async getBuild(@Req() req: any, @Param('id') buildId: string) {
    const { tenantId } = req.user;
    const build = await this.appFactory.getBuild(tenantId, buildId);
    return { build };
  }

  // --- Assets ---

  @Post('assets')
  async uploadAsset(@Req() req: any, @Body() dto: UploadAssetDto) {
    const { tenantId } = req.user;
    const db = this.controlPlaneDb.db;
    const [asset] = await db
      .insert(cpSchema.tenantAssets)
      .values({ tenantId, type: dto.type, url: dto.url, metadata: dto.metadata })
      .returning();
    return { asset };
  }

  @Get('assets')
  async listAssets(@Req() req: any) {
    const { tenantId } = req.user;
    const db = this.controlPlaneDb.db;
    const assets = await db.select().from(cpSchema.tenantAssets).where(eq(cpSchema.tenantAssets.tenantId, tenantId));
    return { assets };
  }
}
