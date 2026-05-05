import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, ProgressService],
  exports: [StudentService, ProgressService],
})
export class StudentModule {}
