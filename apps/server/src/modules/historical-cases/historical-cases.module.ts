import { Module } from '@nestjs/common';
import { HistoricalCasesController } from './historical-cases.controller';
import { HistoricalCasesService } from './historical-cases.service';

@Module({
  controllers: [HistoricalCasesController],
  providers: [HistoricalCasesService],
  exports: [HistoricalCasesService],
})
export class HistoricalCasesModule {}
