// dto/get-candidates-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, IsString, IsBoolean } from 'class-validator';

export class GetCandidatesQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) pageSize: number = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() includeSoftFails?: boolean = true;
}
