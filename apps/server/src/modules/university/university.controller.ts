import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { UniversityPickerOptionDto } from './dto/picker-option.dto';
import { UniversityService } from './university.service';
import { RankingBoardService } from './ranking-board.service';
import { QueryUniversityDto } from './dto/query-university.dto';
import { MapQueryDto } from './dto/map-query.dto';
import { PoiQueryDto } from './dto/poi-query.dto';
import { RankingBoardQueryDto } from './dto/ranking-board-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('院校')
@Controller('universities')
export class UniversityController {
  constructor(
    private universityService: UniversityService,
    private rankingBoardService: RankingBoardService,
  ) {}

  @Get()
  @ApiOperation({ summary: '查询院校列表' })
  async findAll(@Query() query: QueryUniversityDto) {
    return this.universityService.findAll(query);
  }

  @Get('hot')
  @ApiOperation({ summary: '获取热门院校' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHot(@Query('limit') limit?: number) {
    return this.universityService.getHotUniversities(limit);
  }

  @Get('filters')
  @ApiOperation({ summary: '获取筛选选项' })
  async getFilters() {
    return this.universityService.getFilters();
  }

  @Get('picker-options')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '院校 picker 选项（id/code/name 精简，可按 batches 过滤）' })
  @ApiResponse({ status: 200, type: [UniversityPickerOptionDto] })
  @Header('Cache-Control', 'private, max-age=86400')
  async getPickerOptions(
    @Query('batches') batches?: string,
  ): Promise<UniversityPickerOptionDto[]> {
    const list = batches
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.universityService.getPickerOptions(list);
  }

  @Get('ranking-board')
  @ApiOperation({ summary: '院校地域排行榜' })
  @ApiQuery({ name: 'examType', required: false, enum: ['物理', '历史'] })
  async getRankingBoard(@Query() query: RankingBoardQueryDto) {
    return this.rankingBoardService.getRankingBoard(query.examType ?? '物理');
  }

  @Get('map')
  @ApiOperation({ summary: '地图视图:返回带坐标的院校列表(供 AMap markers 用)' })
  async findAllForMap(@Query() query: MapQueryDto) {
    return this.universityService.findAllForMap(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取院校详情' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'subject', required: false, type: String })
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @Query('subject') subject?: string,
  ) {
    return this.universityService.findById(id, subject);
  }

  @Get(':id/majors')
  @ApiOperation({ summary: '获取院校开设专业' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async findMajors(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year?: number,
  ) {
    return this.universityService.findMajors(id, year);
  }

  @Get(':id/admissions')
  @ApiOperation({ summary: '获取院校录取数据' })
  @ApiParam({ name: 'id', type: Number })
  async findAdmissions(@Param('id', ParseIntPipe) id: number) {
    return this.universityService.findAdmissions(id);
  }

  @Get(':uniId/campuses/:campusId/pois')
  @ApiOperation({ summary: '获取校区周边POI' })
  @ApiParam({ name: 'uniId', type: Number })
  @ApiParam({ name: 'campusId', type: Number })
  async getCampusPois(
    @Param('uniId', ParseIntPipe) uniId: number,
    @Param('campusId', ParseIntPipe) campusId: number,
    @Query() query: PoiQueryDto,
  ) {
    return this.universityService.getCampusPois(uniId, campusId, {
      category: query.category,
      limit: query.limit,
    });
  }
}
