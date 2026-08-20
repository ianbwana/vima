import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControlPlaneDbService } from './control-plane-db.service';
import { RedisModule } from './redis.module';
import { TenantDbService } from './tenant-db.service';

@Global()
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [ControlPlaneDbService, TenantDbService],
  exports: [ControlPlaneDbService, TenantDbService],
})
export class DatabaseModule {}
