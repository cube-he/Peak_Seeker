import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('志愿方案')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlanController {
  constructor(private planService: PlanService) {}

  @Post()
  @ApiOperation({ summary: '创建方案' })
  async create(@Request() req: any, @Body() dto: CreatePlanDto) {
    return this.planService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取我的方案列表' })
  async findAll(@Request() req: any) {
    return this.planService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取方案详情' })
  @ApiParam({ name: 'id', type: Number })
  async findById(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.findById(id, req.user.id);
  }

  @Get(':id/full')
  @ApiOperation({ summary: '获取方案详情（含 planItems）' })
  @ApiParam({ name: 'id', type: Number })
  async findFull(@Param('id', ParseIntPipe) id: number) {
    return this.planService.findByIdWithItems(id);
  }

  @Get(':id/version-tree')
  @ApiOperation({ summary: '获取方案版本树' })
  @ApiParam({ name: 'id', type: Number })
  async versionTree(@Param('id', ParseIntPipe) id: number) {
    return this.planService.getVersionTree(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新方案' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.planService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除方案（仅 DRAFT）' })
  @ApiParam({ name: 'id', type: Number })
  async delete(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.deleteDraft(id, req.user.id);
  }

  @Post(':id/start-review')
  @ApiOperation({ summary: '主管认领审核（PENDING_REVIEW → REVIEWING，乐观锁）' })
  @ApiParam({ name: 'id', type: Number })
  async startReview(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.startReview(id, req.user.id);
  }

  @Post(':id/derive-version')
  @ApiOperation({ summary: '派生新版本（拷贝 PlanItem，状态回到 DRAFT）' })
  @ApiParam({ name: 'id', type: Number })
  async derive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.deriveVersion(id, req.user.id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: '审核动作（APPROVE/REJECT/REQUEST_CHANGE/COMMENT）' })
  @ApiParam({ name: 'id', type: Number })
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: ReviewPlanDto,
  ) {
    return this.planService.review(id, req.user.id, dto);
  }

  @Post(':id/submit-review')
  @ApiOperation({ summary: '提交审核（DRAFT → PENDING_REVIEW）' })
  @ApiParam({ name: 'id', type: Number })
  async submitReview(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.submitReview(id, req.user.id);
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: '切换收藏状态' })
  @ApiParam({ name: 'id', type: Number })
  async toggleFavorite(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.toggleFavorite(id, req.user.id);
  }
}
