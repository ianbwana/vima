import { PwaService } from './pwa.service';
import { ThemeService } from './theme.service';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';

describe('PwaService', () => {
  let service: PwaService;
  let mockThemeService: Partial<ThemeService>;
  let mockDb: any;

  beforeEach(() => {
    mockThemeService = {
      getPublishedTheme: jest.fn().mockResolvedValue({
        colors: { primary: '#E91E63', onPrimary: '#FFFFFF', background: '#1A1A2E' },
        typography: { fontFamily: 'Outfit' },
        copy: { appName: 'UrbanRide', tagline: 'Your city, your ride' },
      }),
    };

    mockDb = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => {
            const result: any = Promise.resolve([]);
            result.limit = jest.fn().mockResolvedValue([{ name: 'UrbanRide' }]);
            return result;
          }),
        })),
      })),
    };

    const mockControlPlane = { db: mockDb } as any as ControlPlaneDbService;
    service = new PwaService(mockThemeService as ThemeService, mockControlPlane);
  });

  describe('generateManifest()', () => {
    it('should generate a valid Web App Manifest', async () => {
      const manifest = await service.generateManifest('tenant-1');

      expect(manifest.name).toBe('UrbanRide');
      expect(manifest.short_name).toBe('UrbanRide');
      expect(manifest.theme_color).toBe('#E91E63');
      expect(manifest.background_color).toBe('#1A1A2E');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
      expect(manifest.icons).toBeDefined();
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    it('should truncate short_name to 12 characters', async () => {
      (mockThemeService.getPublishedTheme as jest.Mock).mockResolvedValue({
        colors: { primary: '#333' },
        typography: { fontFamily: 'Inter' },
        copy: { appName: 'SuperLongAppName' },
      });

      const manifest = await service.generateManifest('tenant-1');
      expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    });

    it('should use default values when no theme published', async () => {
      (mockThemeService.getPublishedTheme as jest.Mock).mockResolvedValue(null);

      const manifest = await service.generateManifest('tenant-1');

      expect(manifest.theme_color).toBe('#FF6B3D'); // default accent
      expect(manifest.background_color).toBe('#141414'); // default dark bg
    });

    it('should include icon set with required sizes', async () => {
      const manifest = await service.generateManifest('tenant-1');

      const sizes = manifest.icons.map((i) => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });
  });

  describe('generateCssVariables()', () => {
    it('should generate valid CSS custom properties', () => {
      const css = service.generateCssVariables({
        colors: { primary: '#FF6B3D', onPrimary: '#FFFFFF', secondary: '#4ADE80' },
        typography: { fontFamily: 'DM Sans' },
        logos: {},
        radius: '16px',
      });

      expect(css).toContain(':root {');
      expect(css).toContain('--color-primary: #FF6B3D;');
      expect(css).toContain('--color-on-primary: #FFFFFF;');
      expect(css).toContain('--color-secondary: #4ADE80;');
      expect(css).toContain('--font-family: DM Sans;');
      expect(css).toContain('--border-radius: 16px;');
      expect(css).toContain('}');
    });

    it('should omit optional properties when not provided', () => {
      const css = service.generateCssVariables({
        colors: { primary: '#000', onPrimary: '#FFF' },
        typography: { fontFamily: 'Inter' },
        logos: {},
      });

      expect(css).toContain('--color-primary: #000;');
      expect(css).not.toContain('--color-secondary');
      expect(css).not.toContain('--border-radius');
    });
  });

  describe('getServiceWorkerConfig()', () => {
    it('should return runtime caching strategies', () => {
      const config = service.getServiceWorkerConfig('tenant-1') as any;

      expect(config.precacheRoutes).toBeDefined();
      expect(config.runtimeCaching).toBeDefined();
      expect(config.runtimeCaching.length).toBeGreaterThan(0);
      expect(config.runtimeCaching[0].strategy).toBe('StaleWhileRevalidate');
    });
  });
});
