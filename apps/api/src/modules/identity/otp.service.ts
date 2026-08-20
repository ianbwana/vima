import { Injectable } from '@nestjs/common';
import { eq, and, gt } from 'drizzle-orm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schemas/tenant.schema';

@Injectable()
export class OtpService {
  private readonly OTP_LENGTH = 6;
  private readonly OTP_TTL_SECONDS = 300; // 5 minutes
  private readonly MAX_ATTEMPTS = 5;

  /**
   * Generate a numeric OTP of configured length.
   */
  generate(): string {
    const max = Math.pow(10, this.OTP_LENGTH);
    const min = Math.pow(10, this.OTP_LENGTH - 1);
    const otp = crypto.randomInt(min, max);
    return otp.toString();
  }

  /**
   * Store hashed OTP for phone number.
   */
  async store(db: NodePgDatabase<typeof schema>, phone: string, otp: string) {
    const hash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + this.OTP_TTL_SECONDS * 1000);

    await db.insert(schema.otpAttempts).values({
      phone,
      otpHash: hash,
      expiresAt,
      verified: false,
      attempts: 0,
    });
  }

  /**
   * Verify OTP for phone number.
   * Returns true if valid, false otherwise.
   */
  async verify(db: NodePgDatabase<typeof schema>, phone: string, otp: string): Promise<boolean> {
    // Find the latest unverified OTP for this phone
    const [attempt] = await db
      .select()
      .from(schema.otpAttempts)
      .where(
        and(
          eq(schema.otpAttempts.phone, phone),
          eq(schema.otpAttempts.verified, false),
          gt(schema.otpAttempts.expiresAt, new Date()),
        ),
      )
      .orderBy(schema.otpAttempts.createdAt)
      .limit(1);

    if (!attempt) return false;

    // Check attempt limit
    if (attempt.attempts >= this.MAX_ATTEMPTS) return false;

    // Increment attempts
    await db
      .update(schema.otpAttempts)
      .set({ attempts: attempt.attempts + 1 })
      .where(eq(schema.otpAttempts.id, attempt.id));

    // Verify hash
    const valid = await bcrypt.compare(otp, attempt.otpHash);

    if (valid) {
      // Mark as verified
      await db
        .update(schema.otpAttempts)
        .set({ verified: true })
        .where(eq(schema.otpAttempts.id, attempt.id));
    }

    return valid;
  }

  /**
   * Count recent OTP requests for rate limiting.
   */
  async getRecentAttempts(db: NodePgDatabase<typeof schema>, phone: string): Promise<number> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const attempts = await db
      .select()
      .from(schema.otpAttempts)
      .where(
        and(eq(schema.otpAttempts.phone, phone), gt(schema.otpAttempts.createdAt, tenMinutesAgo)),
      );

    return attempts.length;
  }
}
