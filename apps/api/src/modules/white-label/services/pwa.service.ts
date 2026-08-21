import { Injectable, Logger } from '@nestjs/common';
import { ThemeService } from './theme.service';
import { ThemeTokens } from '../dto/white-label.dto';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';
import { eq } from 'drizzle-orm';
import * as cpSchema from '../../../database/schemas/control-plane.schema';

/**
 * Web App Manifest (W3C spec subset).
 */
export interface WebAppManifest {
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui';
  orientation: 'portrait' | 'any';
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
}

/**
 * PwaService
 *
 * Generates Progressive Web App assets for tenant white-label deployment:
 * - Web App Manifest (manifest.json) from theme tokens
 * - Icon set references (192, 512, maskable)
 * - Service worker configuration
 *
 * The manifest is generated dynamically per tenant based on their
 * published theme and uploaded assets.
 */
@Injectable()
export class PwaService {
  private readonly logger = new Logger(PwaService.name);

  constructor(
    private readonly themeService: ThemeService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  /**
   * Generate a Web App Manifest for a tenant.
   * Used by the PWA to enable installation (Add to Home Screen).
   */
  async generateManifest(tenantId: string): Promise<WebAppManifest> {
    const theme = await this.themeService.getPublishedTheme(tenantId);
    const tenant = await this.getTenant(tenantId);
    const assets = await this.getAssets(tenantId);

    const appName = theme?.copy?.appName || tenant?.name || 'App';
    const themeColor = theme?.colors?.primary || '#FF6B3D';
    const bgColor = theme?.colors?.background || '#141414';

    // Build icon set from uploaded assets
    const icons = this.buildIconSet(assets);

    return {
      name: appName,
      short_name: appName.length > 12 ? appName.slice(0, 12) : appName,
      description: theme?.copy?.tagline,
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: bgColor,
      theme_color: themeColor,
      icons: icons.length > 0 ? icons : this.getDefaultIcons(themeColor),
    };
  }

  /**
   * Generate service worker configuration for the tenant's PWA.
   */
  getServiceWorkerConfig(tenantId: string): object {
    return {
      precacheRoutes: ['/', '/index.html'],
      runtimeCaching: [
        {
          urlPattern: '/api/food/restaurants',
          strategy: 'StaleWhileRevalidate',
          options: { cacheName: 'catalog-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
        },
        {
          urlPattern: '/api/groceries/stores',
          strategy: 'StaleWhileRevalidate',
          options: { cacheName: 'stores-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
        },
        {
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
          strategy: 'CacheFirst',
          options: { cacheName: 'image-cache', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
        },
      ],
    };
  }

  /**
   * Generate CSS custom properties from theme tokens for Next.js/web consumption.
   */
  generateCssVariables(tokens: ThemeTokens): string {
    const vars: string[] = [':root {'];

    if (tokens.colors) {
      vars.push(`  --color-primary: ${tokens.colors.primary};`);
      vars.push(`  --color-on-primary: ${tokens.colors.onPrimary};`);
      if (tokens.colors.secondary) vars.push(`  --color-secondary: ${tokens.colors.secondary};`);
      if (tokens.colors.surface) vars.push(`  --color-surface: ${tokens.colors.surface};`);
      if (tokens.colors.background) vars.push(`  --color-background: ${tokens.colors.background};`);
      if (tokens.colors.error) vars.push(`  --color-error: ${tokens.colors.error};`);
    }

    if (tokens.typography?.fontFamily) {
      vars.push(`  --font-family: ${tokens.typography.fontFamily};`);
    }

    if (tokens.radius) {
      vars.push(`  --border-radius: ${tokens.radius};`);
    }

    vars.push('}');
    return vars.join('\n');
  }

  private buildIconSet(assets: Array<{ type: string; url: string; metadata: any }>): WebAppManifest['icons'] {
    const icons: WebAppManifest['icons'] = [];

    const appIcon = assets.find((a) => a.type === 'app_icon');
    if (appIcon) {
      icons.push(
        { src: appIcon.url, sizes: '192x192', type: 'image/png' },
        { src: appIcon.url, sizes: '512x512', type: 'image/png' },
        { src: appIcon.url, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      );
    }

    const favicon = assets.find((a) => a.type === 'favicon');
    if (favicon) {
      icons.push({ src: favicon.url, sizes: '48x48', type: 'image/png' });
    }

    return icons;
  }

  private getDefaultIcons(themeColor: string): WebAppManifest['icons'] {
    // Return placeholder references; real icons would be generated via an asset pipeline
    return [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ];
  }

  private async getTenant(tenantId: string) {
    const db = this.controlPlaneDb.db;
    const [tenant] = await db
      .select({ name: cpSchema.tenants.name })
      .from(cpSchema.tenants)
      .where(eq(cpSchema.tenants.id, tenantId))
      .limit(1);
    return tenant;
  }

  private async getAssets(tenantId: string) {
    const db = this.controlPlaneDb.db;
    return db.select().from(cpSchema.tenantAssets).where(eq(cpSchema.tenantAssets.tenantId, tenantId));
  }
}
