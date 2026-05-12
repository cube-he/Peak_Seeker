// dto/get-candidates-query.dto.ts
import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, IsString, IsBoolean, IsIn } from 'class-validator';

export const CANDIDATE_GROUP_SORTS = [
  'MAJOR_MATCH',
  'RANK_FIT',
  'MAJOR_MIN_SCORE_DESC',
  'UNIVERSITY_RANK',
  'MAJOR_STRENGTH',
  'PLAN_COUNT_DESC',
  'SUPPLEMENTARY_RATE_DESC',
  'SAFETY_DESC',
] as const;

export type CandidateGroupSort = typeof CANDIDATE_GROUP_SORTS[number];

export class GetCandidatesQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) pageSize: number = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() includeSoftFails?: boolean = true;
  @IsOptional() @IsIn(CANDIDATE_GROUP_SORTS) sort?: CandidateGroupSort = 'MAJOR_MATCH';
}
