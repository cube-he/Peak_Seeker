// plan-candidate.module.ts
import { Module } from '@nestjs/common';
import { PlanCandidateController } from './plan-candidate.controller';
import { PlanCandidateService } from './plan-candidate.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScoreSegmentModule } from '../score-segment/score-segment.module';

@Module({
  imports: [PrismaModule, ScoreSegmentModule],
  controllers: [PlanCandidateController],
  providers: [PlanCandidateService],
  exports: [PlanCandidateService],
})
export class PlanCandidateModule {}
