import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UniversityService } from './university.service';
import { QueryUniversityDto } from './dto/query-university.dto';

@ApiTags('院校')
@Controller('universities')
export class UniversityController {
  constructor(private universityService: UniversityService) {}

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

  @Get(':id')
  @ApiOperation({ summary: '获取院校详情' })
  @ApiParam({ name: 'id', type: Number })
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.universityService.findById(id);
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
}
