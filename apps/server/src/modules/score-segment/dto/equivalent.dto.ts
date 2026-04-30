import { IsInt, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class EquivalentDto {
  @ApiProperty({ example: 2025 })
  @Type(() => Number)
  @IsInt()
  @Min(2022)
  @Max(2030)
  baseYear!: number;

  @ApiProperty({ enum: ['物理', '历史', '理科', '文科'] })
  @IsString()
  @IsIn(['物理', '历史', '理科', '文科'])
  examType!: '物理' | '历史' | '理科' | '文科';

  @ApiProperty({ example: 28500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank!: number;
}
