import { Module } from '@nestjs/common';
import { MajorController } from './major.controller';
import { MajorService } from './major.service';

@Module({
  controllers: [MajorController],
  providers: [MajorService],
  exports: [MajorService],
})
export class MajorModule {}
