import { Module } from '@nestjs/common';
import { BatchConfigController } from './batch-config.controller';
import { BatchConfigService } from './batch-config.service';

@Module({
  // PrismaModule 是全局模块，无需 imports
  controllers: [BatchConfigController],
  providers: [BatchConfigService],
  exports: [BatchConfigService],
})
export class BatchConfigModule {}
