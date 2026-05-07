import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { StudentPlansController } from './student-plans.controller';
import { PlanItemsController } from './plan-items.controller';
import { PlanItemService } from './plan-item.service';

@Module({
  controllers: [PlanController, StudentPlansController, PlanItemsController],
  providers: [PlanService, PlanStateMachineService, PlanItemService],
  exports: [PlanService],
})
export class PlanModule {}
