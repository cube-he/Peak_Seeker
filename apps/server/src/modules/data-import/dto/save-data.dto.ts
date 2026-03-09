import {
  IsString,
  IsInt,
  IsArray,
  IsOptional,
  IsIn,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ScoreRowDto {
  @IsInt()
  score: number;

  @IsInt()
  count: number;

  @IsInt()
  cumulativeCount: number;
}

export class SaveDataDto {
  @IsInt()
  year: number;

  @IsOptional()
  @IsString()
  province?: string = '四川';

  @IsOptional()
  @IsString()
  examType?: string = '物理类';

  @IsOptional()
  @IsString()
  @IsIn(['score_segment', 'admission'])
  dataType?: string = 'score_segment';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScoreRowDto)
  data: ScoreRowDto[];
}
