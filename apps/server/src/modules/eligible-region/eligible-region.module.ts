import { Module } from '@nestjs/common';
import { EligibleRegionService } from './eligible-region.service';
import { EligibleRegionController } from './eligible-region.controller';

@Module({
  controllers: [EligibleRegionController],
  providers: [EligibleRegionService],
  exports: [EligibleRegionService],
})
export class EligibleRegionModule {}
