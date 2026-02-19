import { IsString, IsOptional, IsInt, IsObject, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExamInfoDto {
  @ApiPropertyOptional({ description: '省份' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: '考试类型', example: '高考' })
  @IsOptional()
  @IsString()
  examType?: string;

  @ApiPropertyOptional({ description: '考试年份', example: 2025 })
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2030)
  examYear?: number;

  @ApiPropertyOptional({ description: '分数', example: 550 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(750)
  score?: number;

  @ApiPropertyOptional({ description: '位次', example: 50000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  rank?: number;

  @ApiPropertyOptional({ description: '选科信息', example: { physics: true, chemistry: true, biology: true } })
  @IsOptional()
  @IsObject()
  subjects?: Record<string, boolean>;

  @ApiPropertyOptional({ description: '批次' })
  @IsOptional()
  @IsString()
  batch?: string;
}
