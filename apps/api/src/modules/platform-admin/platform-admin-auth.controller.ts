import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PlatformAdminAuthService } from './platform-admin-auth.service';

class PlatformAdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/**
 * Platform admin auth endpoints.
 *
 * Mounted under `platform-admin/*`, which is excluded from tenant-resolution
 * middleware — these routes intentionally have no tenant context.
 */
@Controller('platform-admin/auth')
export class PlatformAdminAuthController {
  constructor(private readonly authService: PlatformAdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PlatformAdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
