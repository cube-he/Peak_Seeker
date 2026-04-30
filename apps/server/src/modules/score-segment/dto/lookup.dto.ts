import { IsInt, IsString, IsOptional, Min, Max, IsIn, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LookupDto {
  @ApiProperty({ example: 2025 })
  @Type(() => Number)
  @IsInt()
  @Min(2022)
  @Max(2030)
  year!: number;

  @ApiProperty({ enum: ['物理', '历史', '理科', '文科'] })
  @IsString()
  @IsIn(['物理', '历史', '理科', '文科'])
  examType!: '物理' | '历史' | '理科' | '文科';

  @ApiPropertyOptional({ description: '分数（与 rank 二选一）', example: 580 })
  @ValidateIf((o) => o.rank == null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(750)
  @IsOptional()
  score?: number;

  @ApiPropertyOptional({ description: '位次（与 score 二选一）', example: 28500 })
  @ValidateIf((o) => o.score == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rank?: number;
}
