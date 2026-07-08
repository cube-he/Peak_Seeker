import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PlanService } from './plan.service';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { RiskEngineService } from './risk-engine/risk-engine.service';
import { UpsertReviewDraftDto } from './dto/upsert-review-draft.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '../casl';

@ApiTags('志愿方案')
@Controller('plans')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class PlanController {
  constructor(
    private planService: PlanService,
    private draftService: PlanReviewDraftService,
    private riskEngine: RiskEngineService,
  ) {}

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

  @Get('mine')
  @ApiOperation({ summary: '学生端获取自己的方案列表' })
  async findMine(@Request() req: any) {
    return this.planService.findMine(req.user);
  }

  @Get('teacher')
  @ApiOperation({ summary: '教师端获取方案列表' })
  async findTeacherPlans(@Request() req: any, @Query() query: Record<string, string>) {
    return this.planService.findTeacherPlans(req.user, query);
  }

  @Post('risks/:riskId/resolve')
  @ApiOperation({ summary: '解决某条风险' })
  @ApiParam({ name: 'riskId', type: Number })
  async resolveRisk(
    @Request() req: any,
    @Param('riskId', ParseIntPipe) riskId: number,
    @Body() body: { resolution: 'accepted' | 'replaced' | 'ignored'; note?: string },
  ) {
    return this.riskEngine.resolve(req.user.id, riskId, body.resolution, body.note);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取方案详情' })
  @ApiParam({ name: 'id', type: Number })
  async findById(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.findById(id, req.user.id);
  }

  @Get(':id/risks')
  @ApiOperation({ summary: '获取方案所有风险(按 severity 排序)' })
  @ApiParam({ name: 'id', type: Number })
  async getRisks(@Param('id', ParseIntPipe) planId: number, @Request() req: any) {
    await this.planService.findById(planId, req.user.id);
    return this.riskEngine.getPlanRisks(planId);
  }

  @Post(':id/risks/recompute')
  @ApiOperation({ summary: '手动触发风险重算' })
  @ApiParam({ name: 'id', type: Number })
  async recomputeRisks(@Param('id', ParseIntPipe) planId: number, @Request() req: any) {
    await this.planService.findById(planId, req.user.id);
    return this.riskEngine.recomputeForPlan(planId);
  }

  @Get(':id/full')
  @ApiOperation({ summary: '获取方案详情（含 planItems）' })
  @ApiParam({ name: 'id', type: Number })
  async findFull(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.findByIdWithItems(id, req.user.id);
  }

  @Get(':id/version-tree')
  @ApiOperation({ summary: '获取方案版本树' })
  @ApiParam({ name: 'id', type: Number })
  async versionTree(@Param('id', ParseIntPipe) id: number) {
    return this.planService.getVersionTree(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: '获取该方案所属学生+批次的所有版本' })
  @ApiParam({ name: 'id', type: Number })
  async getVersions(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
  ) {
    return this.planService.getVersionsForPlan(planId, req.user.id);
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
  @CheckPolicies((ab) => ab.can('review', 'VolunteerPlan'))
  @ApiOperation({ summary: '主管认领审核（PENDING_REVIEW → REVIEWING，乐观锁）' })
  @ApiParam({ name: 'id', type: Number })
  async startReview(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.startReview(id, req.user.id);
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: '定稿方案（同 batchConfig 内 isFinal 互斥）' })
  @ApiParam({ name: 'id', type: Number })
  async finalize(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.finalize(id, req.user.id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '确认终稿已提交考试院（FINALIZED -> PUBLISHED）' })
  @ApiParam({ name: 'id', type: Number })
  async publish(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.publish(id, req.user.id);
  }

  @Post(':id/parent-confirm')
  @ApiOperation({ summary: '家长确认主管已通过的方案' })
  @ApiParam({ name: 'id', type: Number })
  async parentConfirmRoute(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.parentConfirm(id, req.user.id);
  }

  @Post(':id/parent-request-change')
  @ApiOperation({ summary: '家长退回方案并提交修改意见' })
  @ApiParam({ name: 'id', type: Number })
  async parentRequestChangeRoute(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body: { comment?: string },
  ) {
    return this.planService.parentRequestChange(
      id,
      req.user.id,
      body.comment?.trim() || '家长请求修改方案',
    );
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: '家长确认方案（兼容旧前端）' })
  async confirmAlias(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.parentConfirm(id, req.user.id);
  }

  @Post(':id/derive-version')
  @ApiOperation({ summary: '派生新版本（拷贝 PlanItem，状态回到 DRAFT）' })
  @ApiParam({ name: 'id', type: Number })
  async derive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body: { versionNote?: string } = {},
  ) {
    return this.planService.deriveVersion(id, req.user.id, body.versionNote);
  }

  @Post(':id/review')
  @CheckPolicies((ab) => ab.can('review', 'VolunteerPlan'))
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
  @ApiOperation({ summary: '提交审核（DRAFT → PENDING_REVIEW）; 组数不足时需 body.underfillReason(≥10字)' })
  @ApiParam({ name: 'id', type: Number })
  async submitReview(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body?: { underfillReason?: string },
  ) {
    return this.planService.submitReview(id, req.user.id, body?.underfillReason);
  }

  @Post(':id/withdraw-review')
  @ApiOperation({ summary: '撤回审核（PENDING_REVIEW → DRAFT, 仅出方案老师; 主管开始审核后不可撤）' })
  @ApiParam({ name: 'id', type: Number })
  async withdrawReview(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() body?: { reason?: string },
  ) {
    return this.planService.withdrawReview(id, req.user.id, body?.reason);
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

  @Get(':id/review-draft')
  @ApiOperation({ summary: '获取我对该方案的审核草稿(不存在返回 null)' })
  @ApiParam({ name: 'id', type: Number })
  async getReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
  ) {
    return this.draftService.getDraft(planId, req.user.id);
  }

  @Put(':id/review-draft')
  @ApiOperation({ summary: 'Upsert 我对该方案的审核草稿' })
  @ApiParam({ name: 'id', type: Number })
  async upsertReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
    @Body() dto: UpsertReviewDraftDto,
  ) {
    return this.draftService.upsertDraft(planId, req.user.id, dto);
  }

  @Delete(':id/review-draft')
  @ApiOperation({ summary: '手动清空我对该方案的审核草稿' })
  @ApiParam({ name: 'id', type: Number })
  async deleteReviewDraft(
    @Request() req: any,
    @Param('id', ParseIntPipe) planId: number,
  ) {
    await this.draftService.clearDraft(planId, req.user.id);
    return { ok: true };
  }
}
