import { Injectable, ConflictException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { ControlPlaneDbService } from '@/database/control-plane-db.service';
import * as schema from '@/database/schemas/control-plane.schema';
import { StripeAdapter, PaystackAdapter, PspAdapter } from '@vima/psp-adapters';
import { encrypt, decrypt } from './crypto.util';
import { ConnectPspDto, PspProvider } from './dto/connect-psp.dto';

export interface PspConnectionRecord {
  id: string;
  tenantId: string;
  provider: string;
  verified: boolean;
  lastVerifiedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class PspConnectionService {
  private readonly logger = new Logger(PspConnectionService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    private readonly config: ConfigService,
  ) {
    this.encryptionKey = this.config.getOrThrow<string>('PSP_ENCRYPTION_KEY');
  }

  /**
   * Connects a PSP for a tenant by encrypting and storing the credentials.
   * Enforces one active connection per provider per tenant — if one already exists,
   * it will be replaced (upsert semantics).
   */
  async connect(tenantId: string, input: ConnectPspDto): Promise<PspConnectionRecord> {
    const { provider, credentials } = input;
    const db = this.controlPlaneDb.db;

    // Check if a connection already exists for this tenant + provider
    const [existing] = await db
      .select()
      .from(schema.pspConnections)
      .where(
        and(
          eq(schema.pspConnections.tenantId, tenantId),
          eq(schema.pspConnections.provider, provider),
        ),
      )
      .limit(1);

    // Encrypt the credentials (JSON-stringified)
    const plaintext = JSON.stringify(credentials);
    const encryptedCredentials = encrypt(plaintext, this.encryptionKey);

    if (existing) {
      // Update the existing connection with new encrypted credentials
      const [updated] = await db
        .update(schema.pspConnections)
        .set({
          encryptedCredentials,
          verified: false, // Re-verification needed after credential update
          lastVerifiedAt: null,
        })
        .where(eq(schema.pspConnections.id, existing.id))
        .returning();

      return {
        id: updated.id,
        tenantId: updated.tenantId,
        provider: updated.provider,
        verified: updated.verified,
        lastVerifiedAt: updated.lastVerifiedAt,
        createdAt: updated.createdAt,
      };
    }

    // Create new connection
    const [created] = await db
      .insert(schema.pspConnections)
      .values({
        tenantId,
        provider,
        encryptedCredentials,
      })
      .returning();

    return {
      id: created.id,
      tenantId: created.tenantId,
      provider: created.provider,
      verified: created.verified,
      lastVerifiedAt: created.lastVerifiedAt,
      createdAt: created.createdAt,
    };
  }

  /**
   * Decrypts and returns PSP credentials in-memory.
   * NEVER logs or persists the decrypted credentials.
   */
  async decryptCredentials(tenantId: string, provider: PspProvider): Promise<Record<string, string>> {
    const db = this.controlPlaneDb.db;

    const [connection] = await db
      .select()
      .from(schema.pspConnections)
      .where(
        and(
          eq(schema.pspConnections.tenantId, tenantId),
          eq(schema.pspConnections.provider, provider),
        ),
      )
      .limit(1);

    if (!connection) {
      throw new NotFoundException(
        `No PSP connection found for tenant ${tenantId} with provider ${provider}`,
      );
    }

    try {
      const plaintext = decrypt(connection.encryptedCredentials, this.encryptionKey);
      return JSON.parse(plaintext);
    } catch (error) {
      // Log security-level alert without exposing any sensitive data
      this.logger.error(
        `Failed to decrypt credentials for connection ${connection.id}. Possible key mismatch or data corruption.`,
      );
      throw new InternalServerErrorException('Failed to decrypt PSP credentials');
    }
  }

  /**
   * Retrieves the connection record for a tenant + provider (without credentials).
   */
  async getConnection(tenantId: string, provider: PspProvider): Promise<PspConnectionRecord | null> {
    const db = this.controlPlaneDb.db;

    const [connection] = await db
      .select({
        id: schema.pspConnections.id,
        tenantId: schema.pspConnections.tenantId,
        provider: schema.pspConnections.provider,
        verified: schema.pspConnections.verified,
        lastVerifiedAt: schema.pspConnections.lastVerifiedAt,
        createdAt: schema.pspConnections.createdAt,
      })
      .from(schema.pspConnections)
      .where(
        and(
          eq(schema.pspConnections.tenantId, tenantId),
          eq(schema.pspConnections.provider, provider),
        ),
      )
      .limit(1);

    return connection ?? null;
  }

  /**
   * Lists all PSP connections for a tenant (without credentials).
   */
  async listConnections(tenantId: string): Promise<PspConnectionRecord[]> {
    const db = this.controlPlaneDb.db;

    const connections = await db
      .select({
        id: schema.pspConnections.id,
        tenantId: schema.pspConnections.tenantId,
        provider: schema.pspConnections.provider,
        verified: schema.pspConnections.verified,
        lastVerifiedAt: schema.pspConnections.lastVerifiedAt,
        createdAt: schema.pspConnections.createdAt,
      })
      .from(schema.pspConnections)
      .where(eq(schema.pspConnections.tenantId, tenantId));

    return connections;
  }

  /**
   * Marks a connection as verified. Called after successful test transaction.
   */
  async markVerified(connectionId: string): Promise<PspConnectionRecord> {
    const db = this.controlPlaneDb.db;

    const [updated] = await db
      .update(schema.pspConnections)
      .set({
        verified: true,
        lastVerifiedAt: new Date(),
      })
      .where(eq(schema.pspConnections.id, connectionId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`PSP connection ${connectionId} not found`);
    }

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      provider: updated.provider,
      verified: updated.verified,
      lastVerifiedAt: updated.lastVerifiedAt,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Verifies a PSP connection by performing a test transaction.
   * Creates a small payment intent then immediately attempts to cancel it.
   * On success, marks the connection as verified; on failure, returns error details.
   */
  async verify(connectionId: string, tenantId: string): Promise<{ verified: boolean; error?: string }> {
    const db = this.controlPlaneDb.db;

    // Fetch the connection record
    const [connection] = await db
      .select()
      .from(schema.pspConnections)
      .where(
        and(
          eq(schema.pspConnections.id, connectionId),
          eq(schema.pspConnections.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!connection) {
      throw new NotFoundException(`PSP connection ${connectionId} not found for this tenant`);
    }

    // Decrypt credentials
    let credentials: Record<string, string>;
    try {
      const plaintext = decrypt(connection.encryptedCredentials, this.encryptionKey);
      credentials = JSON.parse(plaintext);
    } catch (error) {
      this.logger.error(
        `Failed to decrypt credentials for connection ${connectionId} during verification`,
      );
      throw new InternalServerErrorException('Failed to decrypt PSP credentials');
    }

    // Instantiate the adapter using factory pattern
    const adapter = this.createAdapter(connection.provider as PspProvider, credentials);

    // Perform a test transaction: create a small payment intent
    try {
      const testIntent = await adapter.createPaymentIntent({
        amount: 100, // 1.00 in minor units
        currency: this.getTestCurrency(connection.provider as PspProvider),
        customerId: '',
        metadata: { test: 'verification', connectionId },
      });

      // Mark as verified on success
      await this.markVerified(connectionId);

      this.logger.log(
        `PSP connection ${connectionId} verified successfully (test intent: ${testIntent.id})`,
      );

      return { verified: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown verification error';
      this.logger.warn(
        `PSP connection ${connectionId} verification failed: ${errorMessage}`,
      );
      return { verified: false, error: errorMessage };
    }
  }

  /**
   * Creates an adapter instance from decrypted credentials.
   */
  private createAdapter(provider: PspProvider, credentials: Record<string, string>): PspAdapter {
    switch (provider) {
      case PspProvider.STRIPE:
        return StripeAdapter.create({
          secretKey: credentials.secretKey,
          webhookSecret: credentials.webhookSecret,
        });
      case PspProvider.PAYSTACK:
        return PaystackAdapter.create({
          secretKey: credentials.secretKey,
        });
      default:
        throw new InternalServerErrorException(`Unsupported PSP provider: ${provider}`);
    }
  }

  /**
   * Returns an appropriate test currency for a PSP provider.
   */
  private getTestCurrency(provider: PspProvider): string {
    switch (provider) {
      case PspProvider.STRIPE:
        return 'usd';
      case PspProvider.PAYSTACK:
        return 'NGN';
      default:
        return 'usd';
    }
  }
}
