import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthRestrictionService } from './health-restriction.service';

@ApiTags('Health Restrictions')
@Controller('health-restrictions')
export class HealthRestrictionController {
  constructor(private healthRestrictionService: HealthRestrictionService) {}

  @Get()
  @ApiOperation({ summary: '获取体检受限条件列表（按 conditionCode 去重）' })
  async getConditionList() {
    return this.healthRestrictionService.getConditionList();
  }
}
