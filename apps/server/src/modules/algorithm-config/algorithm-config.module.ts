import { Module } from '@nestjs/common';
import { AlgorithmConfigController } from './algorithm-config.controller';
import { AlgorithmConfigService } from './algorithm-config.service';

@Module({
  controllers: [AlgorithmConfigController],
  providers: [AlgorithmConfigService],
  exports: [AlgorithmConfigService],
})
export class AlgorithmConfigModule {}
