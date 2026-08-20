import { Injectable, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { PspAdapter, StripeAdapter, PaystackAdapter } from '@vima/psp-adapters';
import { PspConnectionService } from './psp-connection.service';
import { PspProvider } from './dto/connect-psp.dto';

/**
 * Resolves the correct PSP adapter for a tenant at runtime.
 * Looks up the active psp_connection, decrypts credentials, and returns
 * a configured adapter instance using the factory pattern.
 */
@Injectable()
export class PspResolverService {
  private readonly logger = new Logger(PspResolverService.name);

  constructor(
    private readonly pspConnectionService: PspConnectionService,
  ) {}

  /**
   * Resolves a configured PSP adapter for the given tenant.
   *
   * @param tenantId - The tenant ID to resolve the adapter for
   * @param provider - Optional specific provider to resolve. If omitted, resolves the first verified connection.
   * @returns A configured PspAdapter instance ready to make API calls
   * @throws NotFoundException if no connection exists for the tenant/provider
   * @throws InternalServerErrorException if credentials cannot be decrypted
   */
  async resolve(tenantId: string, provider?: PspProvider): Promise<PspAdapter> {
    if (provider) {
      return this.resolveForProvider(tenantId, provider);
    }

    // If no specific provider requested, find any verified connection
    const connections = await this.pspConnectionService.listConnections(tenantId);
    const verified = connections.find((conn) => conn.verified);

    if (!verified) {
      throw new NotFoundException(
        `No verified PSP connection found for tenant ${tenantId}`,
      );
    }

    return this.resolveForProvider(tenantId, verified.provider as PspProvider);
  }

  /**
   * Resolves an adapter for a specific provider.
   */
  private async resolveForProvider(tenantId: string, provider: PspProvider): Promise<PspAdapter> {
    // Verify the connection exists
    const connection = await this.pspConnectionService.getConnection(tenantId, provider);

    if (!connection) {
      throw new NotFoundException(
        `No PSP connection found for tenant ${tenantId} with provider ${provider}`,
      );
    }

    // Decrypt credentials in-memory
    const credentials = await this.pspConnectionService.decryptCredentials(tenantId, provider);

    // Instantiate the adapter using the factory pattern
    return this.createAdapter(provider, credentials);
  }

  /**
   * Factory method that instantiates the correct adapter with decrypted credentials.
   * Each adapter class uses a static `create()` method so the same class can
   * serve multiple tenants with different credentials.
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
        throw new InternalServerErrorException(
          `PSP provider "${provider}" is not supported for adapter resolution`,
        );
    }
  }
}
