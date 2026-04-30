import { Module } from '@nestjs/common';
import { ScoreSegmentController } from './score-segment.controller';
import { ScoreSegmentService } from './score-segment.service';

@Module({
  controllers: [ScoreSegmentController],
  providers: [ScoreSegmentService],
  exports: [ScoreSegmentService],
})
export class ScoreSegmentModule {}
