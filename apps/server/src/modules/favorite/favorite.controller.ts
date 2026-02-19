import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('收藏')
@Controller('favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FavoriteController {
  constructor(private favoriteService: FavoriteService) {}

  @Get()
  @ApiOperation({ summary: '获取收藏列表' })
  @ApiQuery({ name: 'type', required: false, enum: ['university', 'major'] })
  async findAll(@Request() req: any, @Query('type') type?: string) {
    return this.favoriteService.findAll(req.user.id, type);
  }

  @Post()
  @ApiOperation({ summary: '添加收藏' })
  async add(
    @Request() req: any,
    @Body() dto: { type: string; universityId?: number; majorId?: number; notes?: string },
  ) {
    return this.favoriteService.add(req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '取消收藏' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.favoriteService.remove(id, req.user.id);
  }
}
