import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ControlPlaneDbService } from './control-plane-db.service';
import { TenantDbService } from './tenant-db.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ControlPlaneDbService, TenantDbService],
  exports: [ControlPlaneDbService, TenantDbService],
})
export class DatabaseModule {}
