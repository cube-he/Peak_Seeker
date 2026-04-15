import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EligibleRegionService } from './eligible-region.service';

@ApiTags('Eligible Regions')
@Controller('eligible-regions')
export class EligibleRegionController {
  constructor(private eligibleRegionService: EligibleRegionService) {}

  @Get()
  @ApiOperation({ summary: '查询地区资格：传 program 返回地区列表，不传返回可用项目类型' })
  @ApiQuery({ name: 'program', required: false, description: '项目类型（如 ethnic_minority、rural_vitalization 等）' })
  async find(@Query('program') program?: string) {
    if (program) {
      return this.eligibleRegionService.findByProgram(program);
    }
    return this.eligibleRegionService.getPrograms();
  }
}
