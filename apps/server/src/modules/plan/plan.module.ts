import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { StudentPlansController } from './student-plans.controller';
import { PlanItemsController } from './plan-items.controller';
import { PlanItemService } from './plan-item.service';
import { PlanExportService } from './plan-export.service';

@Module({
  controllers: [PlanController, StudentPlansController, PlanItemsController],
  providers: [PlanService, PlanStateMachineService, PlanItemService, PlanExportService],
  exports: [PlanService],
})
export class PlanModule {}
