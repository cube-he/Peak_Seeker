import { Controller, Post, Body, Param, ParseIntPipe, UseGuards, Patch, Delete } from '@nestjs/common';
import { PlanItemService } from './plan-item.service';
import { AddPlanItemDto } from './dto/add-plan-item.dto';
import { UpdatePlanItemDto } from './dto/update-plan-item.dto';
import { ReorderPlanItemsDto } from './dto/reorder-plan-items.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('plans/:planId/items')
export class PlanItemsController {
  constructor(private service: PlanItemService) {}

  @Post()
  add(@Param('planId', ParseIntPipe) planId: number, @Body() dto: AddPlanItemDto) {
    return this.service.add(planId, dto);
  }

  @Patch(':itemId')
  update(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePlanItemDto,
  ) {
    return this.service.update(planId, itemId, dto);
  }

  @Delete(':itemId')
  remove(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.service.remove(planId, itemId);
  }

  @Post('reorder')
  reorder(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: ReorderPlanItemsDto,
  ) {
    return this.service.reorder(planId, dto.itemIds);
  }
}
