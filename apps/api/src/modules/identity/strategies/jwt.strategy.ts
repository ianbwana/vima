import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // The tenant is resolved from host or X-Tenant-Id, both client-controlled.
    // A tenant-scoped token must only be honoured for its own tenant, otherwise
    // a user could read another tenant's data by changing the header.
    // Platform admins operate across tenants and are exempt.
    const resolvedTenantId = (req as any).tenantId as string | undefined;
    if (
      resolvedTenantId &&
      payload.role !== 'platform_admin' &&
      payload.tenantId !== resolvedTenantId
    ) {
      throw new UnauthorizedException('Token is not valid for this tenant');
    }

    return {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
