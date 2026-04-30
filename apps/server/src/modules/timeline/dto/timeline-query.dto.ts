import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TimelineQueryDto {
  @ApiPropertyOptional({ description: '年份，默认当前年', example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2025)
  @Max(2030)
  year?: number;
}
