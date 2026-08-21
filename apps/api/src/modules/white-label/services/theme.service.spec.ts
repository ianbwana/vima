import { ThemeService } from './theme.service';
import { ControlPlaneDbService } from '../../../database/control-plane-db.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation(() => ({
          where: jest.fn().mockImplementation(() => ({
            orderBy: jest.fn().mockImplementation(() => ({
              limit: jest.fn().mockResolvedValue([]),
            })),
            limit: jest.fn().mockResolvedValue([]),
          })),
          orderBy: jest.fn().mockResolvedValue([]),
        })),
      })),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{
            id: 'theme-1',
            tenantId: 'tenant-1',
            tokens: {},
            published: false,
            version: 1,
            createdAt: new Date(),
          }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'theme-1', published: true, version: 1 }]),
          }),
        }),
      }),
    };

    const mockControlPlane = { db: mockDb } as any as ControlPlaneDbService;
    service = new ThemeService(mockControlPlane);
  });

  const validTokens = {
    colors: { primary: '#FF6B3D', onPrimary: '#FFFFFF' },
    typography: { fontFamily: 'Inter' },
    logos: {},
  };

  describe('saveTheme()', () => {
    it('should save a valid theme and return the record', async () => {
      const result = await service.saveTheme('tenant-1', validTokens as any);
      expect(result.id).toBe('theme-1');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should reject theme without colors', async () => {
      await expect(
        service.saveTheme('tenant-1', { typography: { fontFamily: 'Inter' }, logos: {} } as any),
      ).rejects.toThrow('colors');
    });

    it('should reject theme without primary color', async () => {
      await expect(
        service.saveTheme('tenant-1', {
          colors: { onPrimary: '#FFF' },
          typography: { fontFamily: 'Inter' },
          logos: {},
        } as any),
      ).rejects.toThrow('primary');
    });

    it('should reject theme without onPrimary color', async () => {
      await expect(
        service.saveTheme('tenant-1', {
          colors: { primary: '#FF6B3D' },
          typography: { fontFamily: 'Inter' },
          logos: {},
        } as any),
      ).rejects.toThrow('onPrimary');
    });

    it('should reject theme without fontFamily', async () => {
      await expect(
        service.saveTheme('tenant-1', {
          colors: { primary: '#FF6B3D', onPrimary: '#FFF' },
          typography: {},
          logos: {},
        } as any),
      ).rejects.toThrow('fontFamily');
    });

    it('should reject invalid color format', async () => {
      await expect(
        service.saveTheme('tenant-1', {
          colors: { primary: 'red', onPrimary: '#FFF' },
          typography: { fontFamily: 'Inter' },
          logos: {},
        } as any),
      ).rejects.toThrow('Invalid color');
    });

    it('should accept valid hex colors (3, 6, and 8 digit)', async () => {
      // 3-digit
      await expect(service.saveTheme('tenant-1', {
        colors: { primary: '#F00', onPrimary: '#FFF' },
        typography: { fontFamily: 'Inter' },
        logos: {},
      } as any)).resolves.toBeDefined();

      // 8-digit (with alpha)
      await expect(service.saveTheme('tenant-1', {
        colors: { primary: '#FF6B3DCC', onPrimary: '#FFFFFFFF' },
        typography: { fontFamily: 'Inter' },
        logos: {},
      } as any)).resolves.toBeDefined();
    });
  });

  describe('getPublishedTheme()', () => {
    it('should return null when no published theme exists', async () => {
      const result = await service.getPublishedTheme('tenant-1');
      expect(result).toBeNull();
    });

    it('should return tokens when published theme exists', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ tokens: validTokens }]),
          }),
        }),
      });

      const result = await service.getPublishedTheme('tenant-1');
      expect(result).toEqual(validTokens);
    });
  });
});
