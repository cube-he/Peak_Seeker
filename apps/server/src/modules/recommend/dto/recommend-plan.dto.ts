import { IsInt, IsString, IsOptional, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PreferencesDto {
  @ApiPropertyOptional({ description: '偏好省份' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinces?: string[];

  @ApiPropertyOptional({ description: '偏好城市' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];

  @ApiPropertyOptional({ description: '偏好院校类型' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  universityTypes?: string[];

  @ApiPropertyOptional({ description: '偏好专业大类' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  majorCategories?: string[];

  @ApiPropertyOptional({ description: '排除省份' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeProvinces?: string[];

  @ApiPropertyOptional({ description: '排除专业' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeMajors?: string[];
}

class StrategyDto {
  @ApiPropertyOptional({ description: '冲的数量', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  rushCount?: number;

  @ApiPropertyOptional({ description: '稳的数量', default: 40 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  stableCount?: number;

  @ApiPropertyOptional({ description: '保的数量', default: 36 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  safeCount?: number;

  @ApiPropertyOptional({ description: '冲的位次范围', default: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rushRange?: number;

  @ApiPropertyOptional({ description: '保的位次范围', default: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  safeRange?: number;
}

export class RecommendPlanDto {
  @ApiProperty({ description: '分数', example: 550 })
  @IsInt()
  @Min(0)
  @Max(750)
  score: number;

  @ApiProperty({ description: '位次', example: 50000 })
  @IsInt()
  @Min(1)
  rank: number;

  @ApiProperty({ description: '省份', example: '四川' })
  @IsString()
  province: string;

  @ApiPropertyOptional({ description: '选科' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  @ApiPropertyOptional({ description: '偏好设置' })
  @IsOptional()
  @IsObject()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;

  @ApiPropertyOptional({ description: '策略设置' })
  @IsOptional()
  @IsObject()
  @Type(() => StrategyDto)
  strategy?: StrategyDto;
}
