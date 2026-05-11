import { Controller, Post, Body, Param, ParseIntPipe, UseGuards, Req, Get, Query } from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanV2Dto } from './dto/create-plan-v2.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('students/:studentId/plans')
export class StudentPlansController {
  constructor(private service: PlanService) {}

  @Post()
  create(
    @Req() req: any,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: CreatePlanV2Dto,
  ) {
    return this.service.createForStudent(req.user.id, studentId, dto);
  }

  @Get()
  list(
    @Req() req: any,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('batchConfigId') batchConfigId?: string,
    @Query('latest') latest?: string,
  ) {
    return this.service.listForStudent(studentId, {
      batchConfigId: batchConfigId ? parseInt(batchConfigId, 10) : undefined,
      latestOnly: latest === 'true',
    }, req.user);
  }
}
