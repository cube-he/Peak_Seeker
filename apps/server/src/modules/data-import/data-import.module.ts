import { Module } from '@nestjs/common';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { AiConfigModule } from '../ai-config/ai-config.module';

@Module({
  imports: [AiConfigModule],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
