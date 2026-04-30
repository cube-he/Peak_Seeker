import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { TimelineQueryDto } from './dto/timeline-query.dto';

@ApiTags('时间轴')
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get()
  @ApiOperation({ summary: '获取高考时间轴进度' })
  async getTimeline(@Query() query: TimelineQueryDto) {
    const year = query.year ?? new Date().getFullYear();
    const events = await this.timelineService.getTimeline(year);
    return { events };
  }
}
