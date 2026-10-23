import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { ControlPlaneDbService } from '../../database/control-plane-db.service';
import * as schema from '../../database/schemas/control-plane.schema';

/**
 * Authentication for Vima platform administrators.
 *
 * Platform admins live in the control-plane `platform_admins` table (not in any
 * tenant database). A successful login issues a JWT carrying `role: 'platform_admin'`,
 * which satisfies PlatformAdminGuard on platform-scoped endpoints such as
 * listing all tenants.
 */
@Injectable()
export class PlatformAdminAuthService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly controlPlaneDb: ControlPlaneDbService,
  ) {}

  async login(email: string, password: string) {
    const db = this.controlPlaneDb.db;

    const [admin] = await db
      .select()
      .from(schema.platformAdmins)
      .where(eq(schema.platformAdmins.email, email))
      .limit(1);

    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(admin.id);
  }

  private issueTokens(adminId: string) {
    const payload = { sub: adminId, tenantId: null, role: 'platform_admin' };

    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
