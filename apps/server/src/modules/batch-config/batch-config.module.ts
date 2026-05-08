import { Module } from '@nestjs/common';
import { BatchConfigController } from './batch-config.controller';
import { BatchConfigService } from './batch-config.service';
import { StudentBatchesController } from './student-batches.controller';

@Module({
  // PrismaModule 是全局模块，无需 imports
  controllers: [BatchConfigController, StudentBatchesController],
  providers: [BatchConfigService],
  exports: [BatchConfigService],
})
export class BatchConfigModule {}
