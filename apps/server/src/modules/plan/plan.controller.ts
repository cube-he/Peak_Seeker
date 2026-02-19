import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('志愿方案')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlanController {
  constructor(private planService: PlanService) {}

  @Post()
  @ApiOperation({ summary: '创建方案' })
  async create(@Request() req: any, @Body() dto: CreatePlanDto) {
    return this.planService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '获取我的方案列表' })
  async findAll(@Request() req: any) {
    return this.planService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取方案详情' })
  @ApiParam({ name: 'id', type: Number })
  async findById(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.findById(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新方案' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.planService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除方案' })
  @ApiParam({ name: 'id', type: Number })
  async delete(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.planService.delete(id, req.user.id);
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: '切换收藏状态' })
  @ApiParam({ name: 'id', type: Number })
  async toggleFavorite(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.planService.toggleFavorite(id, req.user.id);
  }
}
