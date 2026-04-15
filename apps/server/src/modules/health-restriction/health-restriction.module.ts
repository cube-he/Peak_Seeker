import { Module } from '@nestjs/common';
import { HealthRestrictionService } from './health-restriction.service';
import { HealthRestrictionController } from './health-restriction.controller';

@Module({
  controllers: [HealthRestrictionController],
  providers: [HealthRestrictionService],
  exports: [HealthRestrictionService],
})
export class HealthRestrictionModule {}
