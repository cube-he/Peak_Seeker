import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';
import { AlgorithmConfigService } from './algorithm-config.service';
import { ThresholdsDto } from './dto/thresholds.dto';

@ApiTags('算法配置')
@Controller('algorithm-config')
export class AlgorithmConfigController {
  constructor(private readonly service: AlgorithmConfigService) {}

  @Get('rush-safe-stable-thresholds')
  @ApiOperation({ summary: '获取冲稳保阈值配置（公开读）' })
  async get() {
    return this.service.getRushSafeStableThresholds();
  }

  @Put('rush-safe-stable-thresholds')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'SystemConfig'))
  @ApiOperation({ summary: '更新冲稳保阈值配置（仅管理员）' })
  async set(@Body() dto: ThresholdsDto) {
    await this.service.setRushSafeStableThresholds(dto);
    return { success: true };
  }
}
