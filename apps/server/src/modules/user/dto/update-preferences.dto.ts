import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: '偏好省份', example: ['四川', '重庆'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredProvinces?: string[];

  @ApiPropertyOptional({ description: '偏好城市', example: ['成都', '重庆'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredCities?: string[];

  @ApiPropertyOptional({ description: '偏好专业', example: ['计算机科学与技术', '软件工程'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredMajors?: string[];

  @ApiPropertyOptional({ description: '偏好院校类型', example: ['综合', '理工'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredUniversityTypes?: string[];

  @ApiPropertyOptional({ description: '职业方向' })
  @IsOptional()
  @IsString()
  careerDirection?: string;
}
