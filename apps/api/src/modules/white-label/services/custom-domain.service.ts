import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * CustomDomainService
 *
 * Manages custom domain lifecycle for tenants:
 * 1. Tenant adds domain in portal
 * 2. System creates a custom hostname (Cloudflare for SaaS API)
 * 3. Tenant sets CNAME to platform hostname
 * 4. System verifies DNS + provisions TLS
 * 5. Domain becomes a tenant resolution key
 *
 * In production, this would call Cloudflare's Custom Hostnames API.
 * For now, it manages the state and provides the CNAME target.
 */
@Injectable()
export class CustomDomainService {
  private readonly logger = new Logger(CustomDomainService.name);

  /** The platform's CNAME target hostname */
  private static readonly CNAME_TARGET = 'custom.vima.app';

  constructor(private readonly controlPlaneDb: ControlPlaneDbService) {}

  /**
   * Add a custom domain for a tenant.
   * Creates the domain record and returns CNAME instructions.
   */
  async addDomain(tenantId: string, domain: string) {
    const db = this.controlPlaneDb.db;

    // Validate domain format
    if (!this.isValidDomain(domain)) {
      throw new BadRequestException('Invalid domain format');
    }

    // Check if domain is already registered
    const [existing] = await db
      .select()
      .from(cpSchema.tenantDomains)
      .where(eq(cpSchema.tenantDomains.domain, domain))
      .limit(1);

    if (existing) {
      throw new ConflictException('Domain is already registered');
    }

    // Create domain record (pending verification)
    const [domainRecord] = await db
      .insert(cpSchema.tenantDomains)
      .values({
        tenantId,
        domain,
        type: 'custom',
        verified: false,
        sslStatus: 'pending',
      })
      .returning();

    this.logger.log(`Custom domain added: ${domain} for tenant=${tenantId}`);

    return {
      ...domainRecord,
      cnameTarget: CustomDomainService.CNAME_TARGET,
      instructions: `Add a CNAME record pointing "${domain}" to "${CustomDomainService.CNAME_TARGET}"`,
    };
  }

  /**
   * Verify a custom domain's CNAME configuration.
   * In production, this would check DNS records via Cloudflare API.
   * For now, it simulates verification.
   */
  async verifyDomain(tenantId: string, domainId: string) {
    const db = this.controlPlaneDb.db;

    const [domain] = await db
      .select()
      .from(cpSchema.tenantDomains)
      .where(and(eq(cpSchema.tenantDomains.id, domainId), eq(cpSchema.tenantDomains.tenantId, tenantId)))
      .limit(1);

    if (!domain) {
      throw new BadRequestException('Domain not found');
    }

    // In production: call Cloudflare Custom Hostnames API to check CNAME status
    // For now: simulate DNS check (would use dns.resolveCname in prod)
    const verified = await this.checkCname(domain.domain);

    if (verified) {
      const [updated] = await db
        .update(cpSchema.tenantDomains)
        .set({ verified: true, sslStatus: 'active' })
        .where(eq(cpSchema.tenantDomains.id, domainId))
        .returning();

      this.logger.log(`Domain verified: ${domain.domain} SSL=active`);
      return updated;
    }

    return { ...domain, message: 'CNAME not yet propagated. Please wait and try again.' };
  }

  /**
   * List all domains for a tenant.
   */
  async listDomains(tenantId: string) {
    const db = this.controlPlaneDb.db;
    return db
      .select()
      .from(cpSchema.tenantDomains)
      .where(eq(cpSchema.tenantDomains.tenantId, tenantId));
  }

  /**
   * Remove a custom domain.
   */
  async removeDomain(tenantId: string, domainId: string) {
    const db = this.controlPlaneDb.db;
    await db
      .delete(cpSchema.tenantDomains)
      .where(and(eq(cpSchema.tenantDomains.id, domainId), eq(cpSchema.tenantDomains.tenantId, tenantId)));
    this.logger.log(`Domain removed: id=${domainId} tenant=${tenantId}`);
  }

  /**
   * Check CNAME record for a domain.
   * In production, this calls DNS resolver or Cloudflare API.
   */
  private async checkCname(domain: string): Promise<boolean> {
    try {
      const dns = await import('dns').then((m) => m.promises);
      const records = await dns.resolveCname(domain);
      return records.some((r) => r.includes('vima.app'));
    } catch {
      return false;
    }
  }

  private isValidDomain(domain: string): boolean {
    return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(domain);
  }
}
