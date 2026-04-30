import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScoreSegmentService } from './score-segment.service';
import { LookupDto } from './dto/lookup.dto';
import { EquivalentDto } from './dto/equivalent.dto';

@ApiTags('一分一段')
@Controller('score-segment')
export class ScoreSegmentController {
  constructor(private readonly service: ScoreSegmentService) {}

  @Post('lookup')
  @ApiOperation({ summary: '分数↔位次互查' })
  async lookup(@Body() dto: LookupDto) {
    if (dto.score != null) {
      return this.service.scoreToRank(dto.year, dto.examType, dto.score);
    }
    if (dto.rank != null) {
      return this.service.rankToScore(dto.year, dto.examType, dto.rank);
    }
    throw new BadRequestException('score 或 rank 至少传一个');
  }

  @Post('equivalent')
  @ApiOperation({ summary: '跨年等位换算' })
  async equivalent(@Body() dto: EquivalentDto) {
    return this.service.equivalent(dto.baseYear, dto.examType, dto.rank);
  }
}
