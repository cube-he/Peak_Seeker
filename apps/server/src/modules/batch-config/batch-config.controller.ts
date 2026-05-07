import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchConfigService } from './batch-config.service';
import { BatchPickerOptionDto } from './dto/picker-option.dto';

@ApiTags('批次配置')
@Controller('batch-config')
export class BatchConfigController {
  constructor(private service: BatchConfigService) {}

  @Get('picker-options')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批次 picker 选项（按 year + province 过滤）' })
  @ApiResponse({ status: 200, type: [BatchPickerOptionDto] })
  @Header('Cache-Control', 'private, max-age=86400')
  async getPickerOptions(
    @Query('serviceYear', new DefaultValuePipe(2026), ParseIntPipe) year: number,
    @Query('province', new DefaultValuePipe('四川')) province: string,
  ): Promise<BatchPickerOptionDto[]> {
    return this.service.getPickerOptions(year, province);
  }
}
