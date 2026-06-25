// dto/get-candidates-query.dto.ts
import { Type, Transform } from 'class-transformer';
import { IsOptional, IsInt, Min, Max, IsString, IsBoolean, IsIn } from 'class-validator';
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
// 反向: 默认关, 只有显式 true 才开 (用于默认折叠的开关, 如"显示非意向地区")
const onlyExplicitTrue = ({ value }: { value: unknown }) =>
  value === 'true' || value === true;

// 排序「轴」(GROUP 视图). 方向由 sortDir 单独控制, 不再把方向编进枚举值。
// MAJOR_MATCH 是智能默认(无方向); 其余 3 轴可双向。
// 旧的 RANK_FIT/PLAN_COUNT_DESC/SUPPLEMENTARY_RATE_DESC/PURITY_BEST/MAJOR_STRENGTH 已下线:
// 位次贴近并入综合推荐; 招生人数/征集/纯净度改为卡片信息或筛选(纯净度 = purity 过滤);
// 专业实力下线: 评级数据填充率低 + 学生反馈"看不懂分数"。
export const CANDIDATE_GROUP_SORTS = [
  'MAJOR_MATCH', // 综合推荐 (默认, 无方向)
  'SAFETY', // 录取概率: 偏保(DESC) / 偏冲(ASC)
  'MAJOR_MIN_SCORE', // 专业最低分: 分高(DESC) / 分低(ASC)
  'UNIVERSITY_RANK', // 院校层次: 好校(DESC) / 普通(ASC)
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
  // 排序方向 (仅 GROUP 视图可比较轴生效): DESC = 该轴默认(好的/分高/最稳在前), ASC = 翻转。
  // 缺省按轴默认 (DESC); MAJOR_MATCH 综合推荐忽略此参数。
  @IsOptional() @IsIn(['ASC', 'DESC']) sortDir?: 'ASC' | 'DESC';
  // 视图模式: GROUP=院校专业组卡(默认, 专业优先); UNIVERSITY=院校卡上卷(院校优先)
  @IsOptional() @IsIn(['GROUP', 'UNIVERSITY']) groupBy?: 'GROUP' | 'UNIVERSITY';
  // 办学性质过滤 (两视图均生效, 分页层应用): public=公办, private=民办, sinoForeign=中外合作,
  // hkMacau=港澳合作办学, independent=境外办学(库里无独立学院, running_nature 只有"境外高校独立办学"); 空=全部。
  // 历史只支持 public/private (院校优先视图), 2026-06-25 起扩枚举 + 接到 GROUP 视图分页层。
  // 注: sinoForeign 与下面的 `sinoForeign` 字段语义不同 — `nature='sinoForeign'` 看 university.runningNature
  // 含"中外合作"(校属性), `sinoForeign='only'/'exclude'` 看组内专业 isSinoForeign(组级)。UI 分两个 chip 用。
  @IsOptional() @IsIn(['public', 'private', 'sinoForeign', 'hkMacau', 'independent']) nature?: string;
  // 院校标签 CSV: 985 / 211 / doubleFirstClass; 多选 OR 语义(命中任一即过, 见 filterGroupsByTags); 空=不过滤。分页层。
  @IsOptional() @IsString() tags?: string;
  // 院校背景 CSV: 九校联盟 / 卓越大学联盟 / 国防七子 / ...
  // P1 用 university.universityBackground String LIKE 模糊匹配, 多选 OR 语义。空=不过滤。分页层。
  @IsOptional() @IsString() backgrounds?: string;
  // 院校所在省 CSV (university.province IN); 空=不过滤。分页层。
  @IsOptional() @IsString() universityProvinces?: string;
  // 院校所在市 CSV (university.city IN); 空=不过滤。分页层。
  @IsOptional() @IsString() universityCities?: string;
  // 新增院校/专业过滤: major=组含 isNew 专业, university=院校首次在川招生(历史 3 年未现),
  // either=任一即可; 空=不过滤。分页层。
  @IsOptional() @IsIn(['major', 'university', 'either']) isNewItem?: string;
  // 意向梯队过滤: 0 / undefined = 不过滤 (全部); 1+ = 只显示含该梯队任一专业的院校组
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tier?: number;
  // 是否隐藏已加入当前 plan 的院校组. 默认 true (老师只看未加入的)
  @IsOptional() @Transform(onlyExplicitFalse) @IsBoolean() excludeAdded?: boolean | string = true;
  // 客观纯净度过滤. csv 形式 'S,A,B,C'; 空或 undefined = 不过滤
  @IsOptional() @IsString() purity?: string;
  // 招生类型过滤: CSV 多选(如 普通类本科,国家专项计划); 空/缺省 = 不过滤. 两视图均生效, 分页层应用
  @IsOptional() @IsString() recruitType?: string;
  // 中外合作办学过滤: only=只看含中外合作的, exclude=排除含中外合作的, 空=全部. 两视图均生效
  @IsOptional() @IsIn(['only', 'exclude']) sinoForeign?: 'only' | 'exclude';
  // 是否展开"非意向地区"院校组(整所院校省市都不在学生意向地区内). 默认 false=折叠隐藏; 仅 GROUP 视图。
  // 类型声明 boolean|string 绕过 ValidationPipe 隐式转换(见上方注释), 经 @Transform 后恒为 boolean。
  @IsOptional() @Transform(onlyExplicitTrue) @IsBoolean() includeRegionMismatch?: boolean | string = false;
  // 是否把"硬规则不符"(选科/再选/性别/健康/户籍/民族, 客观资格不符)带出来放各组 hardFailMajors 桶
  // (前端灰显+禁加入). 默认 false=维持原逻辑(直接剔除, 输出不变)。
  @IsOptional() @Transform(onlyExplicitTrue) @IsBoolean() includeHardFails?: boolean | string = false;
  // 分数条: 今年预估分区间过滤 (两端都给才生效). 0..750
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(750) minScore?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(750) maxScore?: number;
}
