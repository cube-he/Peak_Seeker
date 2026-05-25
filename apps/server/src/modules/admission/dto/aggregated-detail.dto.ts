import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Min } from 'class-validator';

export class AggregatedDetailDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  universityId!: number;

  @IsString()
  majorCode!: string;

  @IsString()
  groupCode!: string;

  @IsString()
  batch!: string;

  @IsString()
  recruitType!: string;

  @IsString()
  province!: string;

  @IsIn(['物理', '历史'])
  subjects!: string;
}
