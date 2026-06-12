// dto/get-candidates-query.dto.ts
import { Type, Transform } from 'class-transformer';
import { IsOptional, IsInt, Min, IsString, IsBoolean, IsIn } from 'class-validator';
import { CANDIDATE_UNIVERSITY_SORTS } from '../university-rollup';

// axios 把布尔序列化成 query 字符串 'false'/'true'。坑有两层:
// 1) @Type(()=>Boolean) 下 Boolean('false') === true;
// 2) 全局 ValidationPipe 开了 enableImplicitConversion,只要字段声明类型是 boolean,
//    它会在 @Transform 之前就把 'false' 强转成 true,@Transform 拿到的已经是 true。
// 解法: 字段类型声明成 `boolean | string`(反射类型退化为 Object → 隐式转换不插手),
//        再用 @Transform 手动解析。语义: 这两个开关默认 true、消费端按 `!== false` 判断,
//        所以"只有显式 false 才关"; 缺省时 @Transform 不执行, 由 `= true` 默认值兜底。
const onlyExplicitFalse = ({ value }: { value: unknown }) =>
  !(value === 'false' || value === false);

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

// 院校优先视图额外接受的排序值 (groupBy=UNIVERSITY 时); 校验时合并进白名单
const ACCEPTED_SORTS = [...CANDIDATE_GROUP_SORTS, ...CANDIDATE_UNIVERSITY_SORTS] as const;

export class GetCandidatesQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) pageSize: number = 20;
  @IsOptional() @IsString() keyword?: string; // 旧接口兼容: 同时匹配院校/专业 (合并语义)
  @IsOptional() @IsString() keywordUniversity?: string; // 仅匹配 university.name
  @IsOptional() @IsString() keywordMajor?: string; // 匹配 major.name OR majorName
  @IsOptional() @IsString() keywordGroup?: string; // 匹配 groupName(定向县/专业组名)
  // 梯度档位过滤(全池口径, 分页前生效); 不传 = 全部
  @IsOptional() @IsIn(['RUSH', 'STABLE', 'SAFE', 'NO_LINE']) gradientBand?: string;
  @IsOptional() @Transform(onlyExplicitFalse) @IsBoolean() includeSoftFails?: boolean | string = true;
  @IsOptional() @IsIn(ACCEPTED_SORTS) sort?: string = 'MAJOR_MATCH';
  // 视图模式: GROUP=院校专业组卡(默认, 专业优先); UNIVERSITY=院校卡上卷(院校优先)
  @IsOptional() @IsIn(['GROUP', 'UNIVERSITY']) groupBy?: 'GROUP' | 'UNIVERSITY';
  // 办学性质过滤 (仅院校优先视图): public=只看公办, private=只看民办, 空=全部
  @IsOptional() @IsIn(['public', 'private']) nature?: 'public' | 'private';
  // 意向梯队过滤: 0 / undefined = 不过滤 (全部); 1+ = 只显示含该梯队任一专业的院校组
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tier?: number;
  // 是否隐藏已加入当前 plan 的院校组. 默认 true (老师只看未加入的)
  @IsOptional() @Transform(onlyExplicitFalse) @IsBoolean() excludeAdded?: boolean | string = true;
  // 客观纯净度过滤. csv 形式 'S,A,B,C'; 空或 undefined = 不过滤
  @IsOptional() @IsString() purity?: string;
}
