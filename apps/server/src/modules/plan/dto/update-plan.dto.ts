import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: '方案名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '志愿列表' })
  @IsOptional()
  @IsArray()
  items?: any[];

  @ApiPropertyOptional({ description: '策略' })
  @IsOptional()
  @IsString()
  strategy?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: '状态', enum: ['DRAFT', 'SUBMITTED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'ARCHIVED'])
  status?: 'DRAFT' | 'SUBMITTED' | 'ARCHIVED';

  @ApiPropertyOptional({ description: '是否收藏' })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
