import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * DTO for sending a notification via API (internal/admin use).
 * Most notifications are triggered via events, but this enables
 * direct dispatch for testing or admin-initiated messages.
 */
export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(['push', 'sms', 'whatsapp', 'email'])
  channel: 'push' | 'sms' | 'whatsapp' | 'email';

  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @IsObject()
  @IsOptional()
  templateData?: Record<string, string>;

  @IsEnum(['normal', 'high', 'critical'])
  @IsOptional()
  priority?: 'normal' | 'high' | 'critical';

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  recipientOverride?: string;
}
