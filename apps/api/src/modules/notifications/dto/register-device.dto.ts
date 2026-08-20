import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for registering a device's FCM push token.
 * Called when a user's app starts up or after token refresh.
 */
export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsEnum(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';

  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}

/**
 * DTO for updating notification preferences.
 */
export class UpdateNotificationPreferenceDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsEnum(['push', 'sms', 'whatsapp', 'email'])
  channel: 'push' | 'sms' | 'whatsapp' | 'email';

  enabled: boolean;
}
