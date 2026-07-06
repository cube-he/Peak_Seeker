import { Module } from '@nestjs/common';
import { AdminImportController } from './admin-import.controller';
import { ExcelParserService } from './services/excel-parser.service';
import { MajorStandardizerService } from './services/major-standardizer.service';
import { DataValidatorService } from './services/data-validator.service';
import { BatchImportService } from './services/batch-import.service';
import { CacheRefreshService } from './services/cache-refresh.service';
import { SupplementaryImportService } from './services/supplementary-import.service';

@Module({
  controllers: [AdminImportController],
  providers: [
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
