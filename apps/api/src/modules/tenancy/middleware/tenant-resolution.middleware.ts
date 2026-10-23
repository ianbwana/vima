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
    try {
      // Platform-scoped routes have no single tenant context. The tenants list
      // is authorized by the JWT platform_admin role at the route guard, so we
      // let it through without requiring a resolvable tenant here.
      if (this.isPlatformScopedRoute(req)) {
        next();
        return;
      }

      const tenantId = await this.resolveTenant(req);

      if (!tenantId) {
        throw new HttpException('Tenant could not be resolved', HttpStatus.BAD_REQUEST);
      }

      // Attach tenant context to request
      (req as any).tenantId = tenantId;
      next();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Log unexpected errors and pass through
      console.error('[TenantResolution] Unexpected error:', err);
      throw new HttpException('Tenant could not be resolved', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Routes that operate across all tenants (platform admin) and therefore must
   * not require a resolvable tenant. Authorization is enforced by route guards.
   */
  private isPlatformScopedRoute(req: Request): boolean {
    // Tenant management reads (GET /tenants and GET /tenants/:id) are
    // platform-admin operations authorized by the JWT platform_admin role at
    // the route guard, so there is no single tenant context to resolve here.
    if (req.method !== 'GET') return false;

    // Use originalUrl (always the full request path) and strip the query string
    // and any trailing slash. req.path can be relative depending on how the
    // middleware is mounted, so originalUrl is the reliable source.
    const rawPath = (req.originalUrl || req.path || '').split('?')[0];
    const path = rawPath.replace(/\/+$/, '');
    return path === '/tenants' || path.startsWith('/tenants/');
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

    // 3. Try X-Tenant header (supports both UUID and slug)
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      // Detect if it's a UUID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerTenantId);
      if (isUuid) {
        const tenantByHeader = await this.tenancyService.findById(headerTenantId);
        if (tenantByHeader) return tenantByHeader.id;
      } else {
        const tenantBySlug = await this.tenancyService.findBySlug(headerTenantId);
        if (tenantBySlug) return tenantBySlug.id;
      }
    }

    // 4. Will be resolved from JWT later (handled by auth guard)
    return null;
  }
}
