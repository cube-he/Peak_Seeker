import { Module } from '@nestjs/common';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { AdminImportController } from './admin-import.controller';
import { ExcelParserService } from './services/excel-parser.service';
import { MajorStandardizerService } from './services/major-standardizer.service';
import { DataValidatorService } from './services/data-validator.service';
import { BatchImportService } from './services/batch-import.service';
import { CacheRefreshService } from './services/cache-refresh.service';
import { SupplementaryImportService } from './services/supplementary-import.service';
import { AiConfigModule } from '../ai-config/ai-config.module';

@Module({
  imports: [AiConfigModule],
  controllers: [DataImportController, AdminImportController],
  providers: [
    // Existing OCR-based import service
    DataImportService,
    // New pipeline services
    ExcelParserService,
    MajorStandardizerService,
    DataValidatorService,
    BatchImportService,
    CacheRefreshService,
    SupplementaryImportService,
  ],
  exports: [CacheRefreshService],
})
export class DataImportModule {}
