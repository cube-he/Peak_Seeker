import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { IntakeExportService } from './intake-export.service';
import { StudentServiceReportService } from './student-service-report.service';
import { ScoreSegmentModule } from '../score-segment/score-segment.module';

@Module({
  imports: [ScoreSegmentModule],
  controllers: [StudentController],
  providers: [StudentService, ProgressService, IntakeExportService, StudentServiceReportService],
  exports: [StudentService, ProgressService, IntakeExportService],
})
export class StudentModule {}
