import { IsString, IsInt, IsOptional, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ description: '方案名称', example: '我的志愿方案1' })
  @IsString()
  name: string;

  @ApiProperty({ description: '年份', example: 2025 })
  @IsInt()
  @Min(2020)
  @Max(2030)
  year: number;

  @ApiPropertyOptional({ description: '省份' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiProperty({ description: '志愿列表' })
  @IsArray()
  items: any[];

  @ApiPropertyOptional({ description: '策略' })
  @IsOptional()
  @IsString()
  strategy?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;
}
