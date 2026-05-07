import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanStateMachineService } from './plan-state-machine.service';
import { StudentPlansController } from './student-plans.controller';

@Module({
  controllers: [PlanController, StudentPlansController],
  providers: [PlanService, PlanStateMachineService],
  exports: [PlanService],
})
export class PlanModule {}
