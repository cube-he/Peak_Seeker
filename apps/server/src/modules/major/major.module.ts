import { Module } from '@nestjs/common';
import { MajorController } from './major.controller';
import { MajorService } from './major.service';
import { AdmissionModule } from '../admission/admission.module';

@Module({
  imports: [AdmissionModule],
  controllers: [MajorController],
  providers: [MajorService],
  exports: [MajorService],
})
export class MajorModule {}
