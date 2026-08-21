import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AppGeneratorController, ConfigController, EasWebhookController } from './controllers/app-generator.controller';
import { ManifestService } from './services/manifest.service';
import { AssetPipelineService, AssetPackProcessor } from './services/asset-pipeline.service';
import { ConfigSigningService } from './services/config-signing.service';
import { KeyProvisioningService } from './services/key-provisioning.service';
import { BuildOrchestrationService } from './services/build-orchestration.service';
import { DemoService } from './services/demo.service';

/**
 * AppGeneratorModule
 *
 * Native app generation pipeline for Scale-tier tenants.
 * Produces store-ready iOS and Android apps for both surfaces
 * (customer + provider) from a single white-label Expo codebase.
 *
 * Services:
 * - ManifestService: build manifest CRUD, validation, versioning, diff
 * - AssetPipelineService: asset transformation and content-addressed packs
 * - ConfigSigningService: JWS-signed runtime config with scope enforcement
 * - KeyProvisioningService: client-safe key provisioning (Maps, Firebase, PSP)
 * - BuildOrchestrationService: EAS Build trigger, status tracking, artifacts
 * - DemoService: demo sessions, cohort pairing, rate limiting
 *
 * Controllers:
 * - AppGeneratorController: tenant-facing API (manifest, builds, demo, assets, sounds)
 * - ConfigController: public signed config endpoint (no auth, JWS verified by apps)
 * - EasWebhookController: internal EAS build/submit status webhooks
 */
@Module({
  imports: [
    EntitlementsModule,
    BullModule.registerQueue({ name: 'asset-pack' }),
  ],
  controllers: [AppGeneratorController, ConfigController, EasWebhookController],
  providers: [
    ManifestService,
    AssetPipelineService,
    AssetPackProcessor,
    ConfigSigningService,
    KeyProvisioningService,
    BuildOrchestrationService,
    DemoService,
  ],
  exports: [ManifestService, ConfigSigningService, BuildOrchestrationService, DemoService],
})
export class AppGeneratorModule {}
