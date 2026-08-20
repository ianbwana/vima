import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TenantDbService } from '../../database/tenant-db.service';
import * as schema from '../../database/schemas/tenant.schema';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantDb: TenantDbService,
    private readonly otpService: OtpService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async requestOtp(phone: string, tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    // Rate limiting: check recent OTP requests
    const recentAttempts = await this.otpService.getRecentAttempts(db, phone);
    if (recentAttempts >= 3) {
      throw new BadRequestException('Too many OTP requests. Please try again later.');
    }

    // Generate and store OTP
    const otp = this.otpService.generate();
    await this.otpService.store(db, phone, otp);

    // Emit event for notification service to deliver the OTP
    if (this.eventEmitter) {
      this.eventEmitter.emit('otp.requested', { tenantId, phone, otp });
    }

    // In development without notification service configured, log the OTP
    if (this.config.get('NODE_ENV') !== 'production' && !this.eventEmitter) {
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
    }

    return { message: 'OTP sent successfully', expiresIn: 300 };
  }

  async verifyOtp(phone: string, otp: string, tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const valid = await this.otpService.verify(db, phone, otp);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Find or create user
    let [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(schema.users)
        .values({ phone, status: 'active' })
        .returning();

      // Assign default customer role
      await db.insert(schema.userRoles).values({
        userId: user.id,
        role: 'customer' as typeof schema.userRoleEnum.enumValues[number],
      });
    }

    return this.issueTokens(user.id, tenantId, 'customer');
  }

  async login(email: string, password: string, tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get password credential
    const [auth] = await db
      .select()
      .from(schema.userAuth)
      .where(and(eq(schema.userAuth.userId, user.id), eq(schema.userAuth.type, 'password')))
      .limit(1);

    if (!auth) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, auth.credentialHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get user's role
    const [userRole] = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, user.id))
      .limit(1);

    return this.issueTokens(user.id, tenantId, userRole?.role || 'customer');
  }

  async register(dto: RegisterDto, tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    // Check if email already exists
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, dto.email))
      .limit(1);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // Create user
    const [user] = await db
      .insert(schema.users)
      .values({
        email: dto.email,
        name: dto.name,
        status: 'active',
      })
      .returning();

    // Store password credential
    await db.insert(schema.userAuth).values({
      userId: user.id,
      type: 'password',
      credentialHash: passwordHash,
    });

    // Assign role
    const role = (dto.role || 'merchant') as typeof schema.userRoleEnum.enumValues[number];
    await db.insert(schema.userRoles).values({
      userId: user.id,
      role,
    });

    return this.issueTokens(user.id, tenantId, role);
  }

  async refreshTokens(refreshToken: string) {
    // Decode the refresh token to get tenantId
    const payload = this.jwt.verify(refreshToken, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });

    const db = this.tenantDb.getConnection(payload.tenantId);
    const tokenHash = this.hashToken(refreshToken);

    // Find the session
    const [session] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.refreshTokenHash, tokenHash))
      .limit(1);

    if (!session || new Date() > session.expiresAt) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete old session (rotation)
    await db.delete(schema.userSessions).where(eq(schema.userSessions.id, session.id));

    // Issue new tokens
    return this.issueTokens(payload.sub, payload.tenantId, payload.role);
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const db = this.tenantDb.getConnection(payload.tenantId);
      const tokenHash = this.hashToken(refreshToken);

      await db
        .delete(schema.userSessions)
        .where(eq(schema.userSessions.refreshTokenHash, tokenHash));
    } catch {
      // Silently handle invalid tokens on logout
    }

    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string, tenantId: string) {
    const db = this.tenantDb.getConnection(tenantId);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roles = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId));

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      roles: roles.map((r) => r.role),
    };
  }

  private async issueTokens(userId: string, tenantId: string, role: string) {
    const accessToken = this.jwt.sign({
      sub: userId,
      tenantId,
      role,
    });

    const refreshToken = this.jwt.sign(
      { sub: userId, tenantId, role },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: `${this.REFRESH_TOKEN_EXPIRY_DAYS}d`,
      },
    );

    // Store refresh token hash in session
    const db = this.tenantDb.getConnection(tenantId);
    await db.insert(schema.userSessions).values({
      userId,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
