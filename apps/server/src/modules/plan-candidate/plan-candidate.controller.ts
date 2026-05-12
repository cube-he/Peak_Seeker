// plan-candidate.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { PlanCandidateService } from './plan-candidate.service';
import { GetCandidatesQueryDto } from './dto/get-candidates-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlanCandidateController {
  constructor(private service: PlanCandidateService) {}

  @Get(':planId/candidates')
  getCandidates(
    @Param('planId', ParseIntPipe) planId: number,
    @Query() q: GetCandidatesQueryDto,
    @Req() req: any,
  ) {
    return this.service.getCandidates(planId, q, req.user.id);
  }

  @Get(':planId/candidate-groups')
  getCandidateGroups(
    @Param('planId', ParseIntPipe) planId: number,
    @Query() q: GetCandidatesQueryDto,
    @Req() req: any,
  ) {
    return this.service.getCandidateGroups(planId, q, req.user.id);
  }
}
