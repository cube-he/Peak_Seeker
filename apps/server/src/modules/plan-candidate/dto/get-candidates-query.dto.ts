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
  'PURITY_BEST', // 客观纯净度优先 (S<A<B<C)
] as const;

export type CandidateGroupSort = typeof CANDIDATE_GROUP_SORTS[number];

export class GetCandidatesQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) pageSize: number = 20;
  @IsOptional() @IsString() keyword?: string; // 旧接口兼容: 同时匹配院校/专业 (合并语义)
  @IsOptional() @IsString() keywordUniversity?: string; // 仅匹配 university.name
  @IsOptional() @IsString() keywordMajor?: string; // 匹配 major.name OR majorName
  @IsOptional() @Type(() => Boolean) @IsBoolean() includeSoftFails?: boolean = true;
  @IsOptional() @IsIn(CANDIDATE_GROUP_SORTS) sort?: CandidateGroupSort = 'MAJOR_MATCH';
  // 意向梯队过滤: 0 / undefined = 不过滤 (全部); 1+ = 只显示含该梯队任一专业的院校组
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tier?: number;
  // 是否隐藏已加入当前 plan 的院校组. 默认 true (老师只看未加入的)
  @IsOptional() @Type(() => Boolean) @IsBoolean() excludeAdded?: boolean = true;
  // 客观纯净度过滤. csv 形式 'S,A,B,C'; 空或 undefined = 不过滤
  @IsOptional() @IsString() purity?: string;
}
