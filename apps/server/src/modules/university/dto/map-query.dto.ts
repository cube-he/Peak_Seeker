import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * 地图视图查询参数。复用 list 接口的筛选维度,但不要分页 / 排序——地图一次性
 * 返回所有匹配的院校点(2226 所有坐标,小 payload 可全量拉)。
 */
export class MapQueryDto {
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional() @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '省份' })
  @IsOptional() @IsString()
  province?: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional({ description: '院校类型' })
  @IsOptional() @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '院校层次' })
  @IsOptional() @IsString()
  level?: string;

  @ApiPropertyOptional({ description: '城市档次' })
  @IsOptional() @IsString()
  grade?: string;

  @ApiPropertyOptional({ description: '办学性质' })
  @IsOptional() @IsString()
  nature?: string;

  @ApiPropertyOptional({ description: '是否双一流' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isDoubleFirstClass?: boolean;

  @ApiPropertyOptional({ description: '是否985' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is985?: boolean;

  @ApiPropertyOptional({ description: '是否211' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is211?: boolean;
}
