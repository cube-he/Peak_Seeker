import { Controller, Post, Body, Param, ParseIntPipe, UseGuards, Patch, Delete, Req } from '@nestjs/common';
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
  add(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: AddPlanItemDto,
    @Req() req: any,
  ) {
    return this.service.add(planId, dto, req.user.id);
  }

  @Patch(':itemId')
  update(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdatePlanItemDto,
    @Req() req: any,
  ) {
    return this.service.update(planId, itemId, dto, req.user.id);
  }

  @Delete(':itemId')
  remove(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Req() req: any,
  ) {
    return this.service.remove(planId, itemId, req.user.id);
  }

  @Post('reorder')
  reorder(
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: ReorderPlanItemsDto,
    @Req() req: any,
  ) {
    return this.service.reorder(planId, dto.itemIds, req.user.id);
  }
}
