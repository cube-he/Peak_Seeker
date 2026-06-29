import { Module } from '@nestjs/common';
import { PlanModule } from '../plan/plan.module';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { VolunteerFormImportService } from './volunteer-form-import.service';

@Module({
  imports: [PlanModule],
  providers: [VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
  exports: [VolunteerFormResolverService, StudentBatchMatcherService, VolunteerFormImportService],
})
export class PlanImportModule {}
