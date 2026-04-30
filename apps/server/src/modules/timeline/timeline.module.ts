import { Module, OnModuleInit } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { TimelineScraperService } from './timeline-scraper.service';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService, TimelineScraperService],
  exports: [TimelineService],
})
export class TimelineModule implements OnModuleInit {
  constructor(private readonly timelineService: TimelineService) {}

  async onModuleInit() {
    const year = new Date().getFullYear();
    await this.timelineService.seedYear(year);
  }
}
