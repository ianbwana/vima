import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenancyService } from '../tenancy.service';

/**
 * Tenant resolution middleware.
 * Resolution order: custom domain → subdomain → X-Tenant header → JWT claim
 * Attaches tenant context to the request for downstream use.
 */
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(private readonly tenancyService: TenancyService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = await this.resolveTenant(req);

    if (!tenantId) {
      throw new HttpException('Tenant could not be resolved', HttpStatus.BAD_REQUEST);
    }

    // Attach tenant context to request
    (req as any).tenantId = tenantId;
    next();
  }

  private async resolveTenant(req: Request): Promise<string | null> {
    // 1. Try custom domain
    const host = req.hostname;
    const tenantByDomain = await this.tenancyService.findByDomain(host);
    if (tenantByDomain) return tenantByDomain.id;

    // 2. Try subdomain (e.g., acme.vima.app)
    const baseDomain = process.env.BASE_DOMAIN || 'vima.app';
    if (host.endsWith(`.${baseDomain}`)) {
      const slug = host.replace(`.${baseDomain}`, '');
      const tenantBySlug = await this.tenancyService.findBySlug(slug);
      if (tenantBySlug) return tenantBySlug.id;
    }

    // 3. Try X-Tenant header
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      const tenantByHeader = await this.tenancyService.findById(headerTenantId);
      if (tenantByHeader) return tenantByHeader.id;
    }

    // 4. Will be resolved from JWT later (handled by auth guard)
    return null;
  }
}
