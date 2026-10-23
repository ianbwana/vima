import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy({ getOrThrow: () => 'test-secret' } as unknown as ConfigService);
  const payload = (tenantId: string | null, role: string) => ({ sub: 'user-1', tenantId, role, iat: 0, exp: 0 });
  const req = (tenantId?: string) => ({ tenantId }) as any;

  it('accepts a token for the resolved tenant', async () => {
    await expect(strategy.validate(req('tenant-a'), payload('tenant-a', 'admin'))).resolves.toEqual({
      sub: 'user-1',
      tenantId: 'tenant-a',
      role: 'admin',
    });
  });

  it('rejects a token issued for a different tenant', async () => {
    await expect(strategy.validate(req('tenant-b'), payload('tenant-a', 'admin'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows platform admins on any tenant', async () => {
    await expect(strategy.validate(req('tenant-b'), payload(null, 'platform_admin'))).resolves.toMatchObject({
      role: 'platform_admin',
    });
  });

  it('accepts tenant tokens on routes with no resolved tenant', async () => {
    await expect(strategy.validate(req(undefined), payload('tenant-a', 'customer'))).resolves.toMatchObject({
      tenantId: 'tenant-a',
    });
  });
});
