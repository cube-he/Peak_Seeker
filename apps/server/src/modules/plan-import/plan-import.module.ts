import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { VolunteerFormParserService } from './volunteer-form-parser.service';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { VolunteerFormImportService } from './volunteer-form-import.service';
import { VolunteerFormImportController } from './volunteer-form-import.controller';

@Module({
  imports: [PlanModule],
  controllers: [VolunteerFormImportController],
  providers: [VolunteerFormParserService, VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
  exports: [VolunteerFormParserService, VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
})
export class PlanImportModule {}
