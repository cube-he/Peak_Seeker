import { Module } from '@nestjs/common';
import { UniversityController } from './university.controller';
import { UniversityService } from './university.service';
import { RankingBoardService } from './ranking-board.service';
import { AdmissionModule } from '../admission/admission.module';

@Module({
  imports: [AdmissionModule],
  controllers: [UniversityController],
  providers: [UniversityService, RankingBoardService],
  exports: [UniversityService],
})
export class UniversityModule {}
