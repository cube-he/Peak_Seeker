import { Module } from '@nestjs/common';
import { RecommendController } from './recommend.controller';
import { RecommendService } from './recommend.service';
import { RecommendEngine } from './algorithms/recommend-engine';

@Module({
  controllers: [RecommendController],
  providers: [RecommendService, RecommendEngine],
  exports: [RecommendService],
})
export class RecommendModule {}
