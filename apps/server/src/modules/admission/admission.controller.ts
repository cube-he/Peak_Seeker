import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdmissionService } from './admission.service';

@ApiTags('录取数据')
@Controller('admissions')
export class AdmissionController {
  constructor(private admissionService: AdmissionService) {}

  @Get('by-score')
  @ApiOperation({ summary: '按分数查询录取数据' })
  @ApiQuery({ name: 'score', type: Number, required: true })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  @ApiQuery({ name: 'range', type: Number, required: false })
  async findByScore(
    @Query('score') score: number,
    @Query('province') province: string,
    @Query('year') year?: number,
    @Query('range') range?: number,
  ) {
    return this.admissionService.findByScore({ score, province, year, range });
  }

  @Get('by-rank')
  @ApiOperation({ summary: '按位次查询录取数据' })
  @ApiQuery({ name: 'rank', type: Number, required: true })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  @ApiQuery({ name: 'range', type: Number, required: false })
  async findByRank(
    @Query('rank') rank: number,
    @Query('province') province: string,
    @Query('year') year?: number,
    @Query('range') range?: number,
  ) {
    return this.admissionService.findByRank({ rank, province, year, range });
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取录取统计数据' })
  @ApiQuery({ name: 'province', type: String, required: true })
  @ApiQuery({ name: 'year', type: Number, required: false })
  async getStatistics(
    @Query('province') province: string,
    @Query('year') year?: number,
  ) {
    return this.admissionService.getStatistics(province, year);
  }
}
