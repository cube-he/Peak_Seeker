import { Controller, Get, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BatchConfigService } from './batch-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('批次配置')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('students/:studentId')
export class StudentBatchesController {
  constructor(private service: BatchConfigService) {}

  @Get('eligible-batches')
  @ApiOperation({ summary: '该学生可填报批次列表' })
  list(@Param('studentId', ParseIntPipe) studentId: number, @Req() req: any) {
    return this.service.listEligibleForStudent(studentId, req.user);
  }
}
