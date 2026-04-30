import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FindAggregatedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(750)
  score?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank?: number;

  @IsString()
  province: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  range?: number;

  @IsOptional()
  @IsString()
  batch?: string;

  @IsOptional()
  @IsIn(['物理', '历史'])
  subjects?: string;

  @IsOptional()
  @IsString()
  recruitType?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is985?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is211?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDoubleFirstClass?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
