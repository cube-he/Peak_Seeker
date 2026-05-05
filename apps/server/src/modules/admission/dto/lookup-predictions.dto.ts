import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested, ArrayMaxSize } from 'class-validator';

export class PredictionKeyDto {
  @IsInt()
  universityId: number;

  @IsString()
  groupCode: string;

  @IsString()
  batch: string;

  @IsString()
  recruitType: string;

  @IsString()
  subjects: string;
}

export class LookupPredictionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PredictionKeyDto)
  keys: PredictionKeyDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetYear?: number;
}
