import { Controller, Get, UseGuards } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { TenantId } from '../tenancy/decorators/tenant.decorator';
import { MetricsResponseDto } from './dto/metrics-response.dto';
import { JobsByModuleResponseDto } from './dto/jobs-by-module-response.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  async getMetrics(@TenantId() tenantId: string): Promise<MetricsResponseDto> {
    return this.metricsService.getMetrics(tenantId);
  }

  @Get('jobs-by-module')
  async getJobsByModule(@TenantId() tenantId: string): Promise<JobsByModuleResponseDto> {
    return this.metricsService.getJobsByModule(tenantId);
  }
}
