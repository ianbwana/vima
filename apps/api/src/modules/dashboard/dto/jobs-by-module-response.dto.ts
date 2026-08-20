export class JobsByModuleEntryDto {
  date: string; // ISO date string (YYYY-MM-DD)
  module: string; // job type (ride, delivery_leg, parcel)
  count: number;
}

export class JobsByModuleResponseDto {
  data: JobsByModuleEntryDto[];
}
