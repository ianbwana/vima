import { Module } from '@nestjs/common';
import { LedgerService } from './ledger/ledger.service';
import { PspConnectionService } from './psp-connection/psp-connection.service';
import { PspConnectionController } from './psp-connection/psp-connection.controller';
import { PspResolverService } from './psp-connection/psp-resolver.service';

@Module({
  controllers: [PspConnectionController],
  providers: [LedgerService, PspConnectionService, PspResolverService],
  exports: [LedgerService, PspConnectionService, PspResolverService],
})
export class PaymentsModule {}
