import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RecommendService } from './recommend.service';
import { RecommendPlanDto } from './dto/recommend-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('智能推荐')
@Controller('recommend')
export class RecommendController {
  constructor(private recommendService: RecommendService) {}

  @Post('plan')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成志愿方案' })
  async generatePlan(@Body() dto: RecommendPlanDto) {
    return this.recommendService.generatePlan(dto);
  }

  @Post('universities')
  @ApiOperation({ summary: '推荐院校' })
  async recommendUniversities(
    @Body() dto: { score: number; rank: number; province: string; limit?: number },
  ) {
    return this.recommendService.recommendUniversities(dto);
  }
}
