import { IsEnum, IsObject, IsNotEmpty } from 'class-validator';

export enum PspProvider {
  STRIPE = 'stripe',
  PAYSTACK = 'paystack',
  XENDIT = 'xendit',
  MERCADO_PAGO = 'mercado_pago',
}

export class ConnectPspDto {
  @IsEnum(PspProvider)
  provider: PspProvider;

  @IsObject()
  @IsNotEmpty()
  credentials: Record<string, string>;
}
