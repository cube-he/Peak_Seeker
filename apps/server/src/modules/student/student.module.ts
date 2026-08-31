import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { IntakeExportService } from './intake-export.service';
import { ScoreSegmentModule } from '../score-segment/score-segment.module';
import { PlanImportModule } from '../plan-import/plan-import.module';
import { AdmissionMatchService } from './admission-match.service';

@Module({
  imports: [ScoreSegmentModule, PlanImportModule],
  controllers: [StudentController],
  providers: [
    StudentService,
    ProgressService,
    IntakeExportService,
    AdmissionMatchService,
  ],
  exports: [StudentService, ProgressService, IntakeExportService],
})
export class StudentModule {}
