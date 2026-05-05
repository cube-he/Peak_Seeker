import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { IntakeExportService } from './intake-export.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ProgressService, IntakeExportService],
  exports: [StudentService, ProgressService, IntakeExportService],
})
export class StudentModule {}
