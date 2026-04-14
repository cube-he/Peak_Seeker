import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// PrismaService and RedisService are injected via their @Global() modules
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
