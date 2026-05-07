import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { BonusCalcService } from './bonus-calc.service';

@Module({
  controllers: [PolicyController],
  providers: [BonusCalcService],
  exports: [BonusCalcService],
})
export class PolicyModule {}
