import { Module } from '@nestjs/common';
import { WhiteLabelController } from './controllers/white-label.controller';
import { ThemeService } from './services/theme.service';
import { PwaService } from './services/pwa.service';
import { CustomDomainService } from './services/custom-domain.service';
import { AppFactoryService } from './services/app-factory.service';

/**
 * WhiteLabelModule
 *
 * Phase 5: White-labeling and app factory infrastructure.
 *
 * Provides:
 * - Theme token management (save, publish, version, CSS generation)
 * - PWA manifest generation (per-tenant installable web app)
 * - Custom domain management (CNAME, verification, TLS)
 * - App factory pipeline (native build triggers, status, artifacts)
 * - Asset management (logos, icons, splash screens)
 */
@Module({
  controllers: [WhiteLabelController],
  providers: [ThemeService, PwaService, CustomDomainService, AppFactoryService],
  exports: [ThemeService, PwaService, CustomDomainService],
})
export class WhiteLabelModule {}
