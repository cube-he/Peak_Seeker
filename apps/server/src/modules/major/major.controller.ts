import { Controller, Get, Header, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { MajorService } from './major.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MajorPickerOptionDto } from './dto/picker-option.dto';

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
    @Query('emerging') emerging?: string,
    @Query('electiveSubject') electiveSubject?: string,
    @Query('sortBy') sortBy?: string,
    @Query('subjectLane') subjectLane?: string,
    @Query('batch') batch?: string,
    @Query('recruitType') recruitType?: string,
    @Query('hasSupplementary') hasSupplementary?: string,
  ) {
    return this.majorService.findAll({
      page,
      pageSize,
      keyword,
      category,
      level,
      discipline,
      emerging: emerging === 'true' || emerging === '1',
      electiveSubject,
      sortBy,
      subjectLane,
      batch,
      recruitType,
      hasSupplementary: hasSupplementary === 'true' || hasSupplementary === '1',
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

  @Get('picker-options')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '专业 picker 选项（id/code/name 精简，可按 batches 过滤）' })
  @ApiResponse({ status: 200, type: [MajorPickerOptionDto] })
  @Header('Cache-Control', 'private, max-age=86400')
  async getPickerOptions(
    @Query('batches') batches?: string,
  ): Promise<MajorPickerOptionDto[]> {
    const list = batches
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.majorService.getPickerOptions(list);
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
