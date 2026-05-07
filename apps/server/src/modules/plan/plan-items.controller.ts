import { Controller, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PlanItemService } from './plan-item.service';
import { AddPlanItemDto } from './dto/add-plan-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('plans/:planId/items')
export class PlanItemsController {
  constructor(private service: PlanItemService) {}

  @Post()
  add(@Param('planId', ParseIntPipe) planId: number, @Body() dto: AddPlanItemDto) {
    return this.service.add(planId, dto);
  }
}
