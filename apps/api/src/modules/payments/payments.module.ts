import { Module } from '@nestjs/common';
import { LedgerService } from './ledger/ledger.service';
import { PspConnectionService } from './psp-connection/psp-connection.service';
import { PspConnectionController } from './psp-connection/psp-connection.controller';
import { PspResolverService } from './psp-connection/psp-resolver.service';
import { WalletService } from './wallet/wallet.service';
import { WalletController } from './wallet/wallet.controller';

@Module({
  controllers: [PspConnectionController, WalletController],
  providers: [LedgerService, PspConnectionService, PspResolverService, WalletService],
  exports: [LedgerService, PspConnectionService, PspResolverService, WalletService],
})
export class PaymentsModule {}
