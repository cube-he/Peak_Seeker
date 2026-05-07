// plan-candidate.module.ts
import { Module } from '@nestjs/common';
import { PlanCandidateController } from './plan-candidate.controller';
import { PlanCandidateService } from './plan-candidate.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlanCandidateController],
  providers: [PlanCandidateService],
  exports: [PlanCandidateService],
})
export class PlanCandidateModule {}
