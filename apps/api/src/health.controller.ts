import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { ControlPlaneDbService } from './database/control-plane-db.service';
import { REDIS_CLIENT } from './database/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly controlPlaneDb: ControlPlaneDbService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async check(@Res() res: Response) {
    const [postgresHealthy, redisHealthy] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);

    const status = postgresHealthy && redisHealthy ? 'ok' : 'error';
    const httpStatus =
      postgresHealthy && redisHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(httpStatus).json({
      status,
      postgres: postgresHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
    });
  }

  private async checkPostgres(): Promise<boolean> {
    return this.controlPlaneDb.isHealthy();
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
