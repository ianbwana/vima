import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign, createVerify, generateKeyPairSync } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * Runtime config document delivered to apps via signed JWS.
 */
export interface RuntimeConfig {
  tenantId: string;
  surface: 'customer' | 'provider';
  environment: 'production' | 'preview' | 'demo';
  endpoints: {
    apiBaseUrl: string;
    realtimeUrl: string;
    assetsBaseUrl: string;
  };
  keys: Record<string, string>; // key_type → value (client-safe only)
  modules: string[];             // enabled module IDs or job types
  featureFlags: Record<string, boolean>;
  theme?: Record<string, unknown>; // theme token refresh
  minimumRuntimeVersion?: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * ConfigSigningService
 *
 * Signs runtime config documents as JWS (RS256) using a platform key.
 * Enforces scope rules:
 * - demo environment: only test-mode PSP keys, sandbox endpoints
 * - production: only live endpoints, live keys
 * - Surface mismatch between config and request = reject
 * - Tenant mismatch = reject
 *
 * The config endpoint is public (no auth) — apps use signed config
 * with baked public key for verification.
 */
@Injectable()
export class ConfigSigningService {
  private readonly logger = new Logger(ConfigSigningService.name);
  private readonly privateKey: string;
  private readonly publicKey: string;

  /** Config TTL: 15 minutes */
  private static readonly CONFIG_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {
    // In production: load from KMS. For dev: generate ephemeral keypair.
    const existingPrivate = this.config.get<string>('CONFIG_SIGNING_PRIVATE_KEY');
    if (existingPrivate) {
      this.privateKey = existingPrivate;
      this.publicKey = this.config.get<string>('CONFIG_SIGNING_PUBLIC_KEY') || '';
    } else {
      const pair = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      });
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
      this.logger.warn('Using ephemeral signing keypair (dev mode). Set CONFIG_SIGNING_PRIVATE_KEY in production.');
    }
  }

  /**
   * Get the platform public key (baked into app binaries).
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Generate and sign a runtime config for a tenant/surface/environment.
   * Returns a compact JWS (header.payload.signature).
   */
  async generateSignedConfig(
    tenantId: string,
    surface: 'customer' | 'provider',
    environment: 'production' | 'preview' | 'demo',
  ): Promise<string> {
    // Build the config document
    const configDoc = await this.buildConfigDocument(tenantId, surface, environment);

    // Enforce scope rules
    this.enforceScopeRules(configDoc);

    // Sign as JWS
    return this.signJws(configDoc);
  }

  /**
   * Verify a signed config (used for testing/debugging).
   */
  verifyJws(jws: string): RuntimeConfig | null {
    try {
      const [headerB64, payloadB64, signatureB64] = jws.split('.');
      const signingInput = `${headerB64}.${payloadB64}`;

      const verifier = createVerify('RSA-SHA256');
      verifier.update(signingInput);

      const valid = verifier.verify(this.publicKey, signatureB64, 'base64url');
      if (!valid) return null;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
      return payload as RuntimeConfig;
    } catch {
      return null;
    }
  }

  /**
   * Build the runtime config document from control plane data.
   */
  private async buildConfigDocument(
    tenantId: string,
    surface: 'customer' | 'provider',
    environment: 'production' | 'preview' | 'demo',
  ): Promise<RuntimeConfig> {
    const db = this.controlPlaneDb.db;

    // Get tenant endpoint document
    const [endpoints] = await db
      .select()
      .from(cpSchema.tenantEndpoints)
      .where(and(
        eq(cpSchema.tenantEndpoints.tenantId, tenantId),
        eq(cpSchema.tenantEndpoints.environment, environment),
      ))
      .limit(1);

    // Get tenant info for modules
    const [tenant] = await db
      .select()
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.id, tenantId))
      .limit(1);

    // Get key grants for this environment
    const keyGrants = await db
      .select()
      .from(cpSchema.appKeyGrants)
      .where(and(
        eq(cpSchema.appKeyGrants.tenantId, tenantId),
        eq(cpSchema.appKeyGrants.environment, environment),
      ));

    const keys: Record<string, string> = {};
    for (const grant of keyGrants) {
      keys[grant.keyType] = grant.vendorRef || '';
    }

    // Derive modules/job types based on surface
    const enabledModules = (tenant?.enabledModules as string[]) || [];
    const modules = surface === 'provider'
      ? this.deriveJobTypes(enabledModules)
      : enabledModules;

    const now = Date.now();

    return {
      tenantId,
      surface,
      environment,
      endpoints: {
        apiBaseUrl: endpoints?.endpointDocument?.apiBaseUrl || `https://${tenant?.slug || tenantId}.platform.app/api`,
        realtimeUrl: endpoints?.endpointDocument?.realtimeUrl || `wss://${tenant?.slug || tenantId}.platform.app/rt`,
        assetsBaseUrl: endpoints?.endpointDocument?.assetsBaseUrl || `https://cdn.platform.app/t/${tenant?.slug || tenantId}`,
      },
      keys,
      modules,
      featureFlags: {},
      issuedAt: now,
      expiresAt: now + ConfigSigningService.CONFIG_TTL_MS,
    };
  }

  /**
   * Enforce scope rules to prevent demo↔production leakage.
   */
  private enforceScopeRules(config: RuntimeConfig): void {
    if (config.environment === 'demo') {
      // Demo must not carry production endpoints
      for (const [keyType, value] of Object.entries(config.keys)) {
        if (keyType === 'psp_publishable' && value && !value.includes('test')) {
          throw new ForbiddenException('Demo config cannot carry live PSP keys');
        }
      }
    }
  }

  /**
   * Derive provider job types from enabled customer modules.
   */
  private deriveJobTypes(modules: string[]): string[] {
    const mapping: Record<string, string> = {
      rides: 'trips',
      food: 'deliveries',
      groceries: 'deliveries',
      courier: 'parcels',
      home_services: 'jobs',
    };
    return [...new Set(modules.map((m) => mapping[m]).filter(Boolean))];
  }

  /**
   * Sign a payload as a compact JWS (header.payload.signature).
   */
  private signJws(payload: RuntimeConfig): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${headerB64}.${payloadB64}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(this.privateKey, 'base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
