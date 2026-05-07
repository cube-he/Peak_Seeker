import { IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanV2Dto {
  @Type(() => Number) @IsInt() @Min(1) batchConfigId: number;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() notes?: string;
}
