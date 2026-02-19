import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MajorService } from './major.service';

@ApiTags('专业')
@Controller('majors')
export class MajorController {
  constructor(private majorService: MajorService) {}

  @Get()
  @ApiOperation({ summary: '查询专业列表' })
  async findAll(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('discipline') discipline?: string,
  ) {
    return this.majorService.findAll({
      page,
      pageSize,
      keyword,
      category,
      level,
      discipline,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: '获取专业分类' })
  async getCategories() {
    return this.majorService.getCategories();
  }

  @Get('hot')
  @ApiOperation({ summary: '获取热门专业' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHot(@Query('limit') limit?: number) {
    return this.majorService.getHotMajors(limit);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取专业详情' })
  @ApiParam({ name: 'id', type: Number })
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.majorService.findById(id);
  }

  @Get(':id/universities')
  @ApiOperation({ summary: '获取开设该专业的院校' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async findUniversities(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year?: number,
  ) {
    return this.majorService.findUniversities(id, year);
  }
}
