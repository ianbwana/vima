import { IsString, IsUUID, IsInt, IsPositive } from 'class-validator';

export class RecordUsageDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  metric: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}
