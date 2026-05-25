import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdmissionService } from './admission.service';
import { FindAggregatedDto } from './dto/find-aggregated.dto';
import { AggregatedDetailDto } from './dto/aggregated-detail.dto';
import { LookupPredictionsDto } from './dto/lookup-predictions.dto';

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

  @Get('aggregated')
  @ApiOperation({ summary: '聚合查询录取数据（轻量列表项）' })
  async findAggregated(@Query() dto: FindAggregatedDto) {
    return this.admissionService.findAggregated(dto);
  }

  @Get('aggregated/detail')
  @ApiOperation({ summary: '聚合录取结果详情（单组合全年份+招生计划+征集志愿）' })
  async findAggregatedDetail(@Query() dto: AggregatedDetailDto) {
    return this.admissionService.findAggregatedDetail(dto);
  }

  @Post('lookup-predictions')
  @ApiOperation({ summary: '批量查询 RankPrediction 按自然键' })
  async lookupPredictions(@Body() dto: LookupPredictionsDto) {
    const map = await this.admissionService.lookupPredictionsByKeys(dto.keys, dto.targetYear);
    const predictions = dto.keys.map((k) => {
      const compositeKey = [k.universityId, k.groupCode, k.batch, k.recruitType, k.subjects].join('|');
      return map.get(compositeKey) ?? null;
    });
    return { predictions };
  }
}
