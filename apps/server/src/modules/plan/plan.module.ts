import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { PlanReviewDraftService } from './plan-review-draft.service';
import { StudentPlansController } from './student-plans.controller';
import { PlanItemsController } from './plan-items.controller';
import { PlanItemService } from './plan-item.service';
import { PlanExportService } from './plan-export.service';
import { RiskEngineService } from './risk-engine/risk-engine.service';

@Module({
  controllers: [PlanController, StudentPlansController, PlanItemsController],
  providers: [
    PlanService,
    PlanStateMachineService,
    PlanItemService,
    PlanExportService,
    PlanReviewDraftService,
    RiskEngineService,
  ],
  exports: [PlanService, PlanReviewDraftService, RiskEngineService],
})
export class PlanModule {}
