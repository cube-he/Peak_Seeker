import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNumber,
  IsDate,
  ValidateNested,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NewExamType,
  ExamSource,
  PriorityMode,
  CareerPlan,
  StayPreference,
  AcceptLevel,
  TuitionBudget,
  PoliticalStatus,
  BonusPolicyStatus,
  RemoteAreaAcceptance,
  ColdMajorAcceptance,
  FormFiller,
} from '@prisma/client';
import { BonusItemDto } from './bonus-item.dto';

/**
 * 意向专业梯队项: { tier: 0=意向池 / 1..N=梯队, majors: 专业名数组 }
 * 必须显式声明嵌套 class — 之前声明为 string[] 时, 全局 ValidationPipe 的
 * enableImplicitConversion 会把对象元素剥成空数组, tiers 数据整体丢失 (2026-06-11 修复)
 */
export class PreferredMajorTierDto {
  @IsInt()
  @Min(0)
  tier!: number;

  @IsArray()
  @IsString({ each: true })
  majors!: string[];
}

export class UpdateStudentProfileDto {
  // 自动保存场景下前端不会带 dataVersion（只发改动字段），此时跳过乐观锁走 last-write-wins
  @ApiPropertyOptional({ description: '数据版本号（乐观锁）；省略时跳过版本校验' })
  @IsOptional()
  @IsInt()
  dataVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ethnicity?: string;

  // --- 基本信息 ---

  // birthDate 在 user 表 (USER_LEVEL_FIELDS 路由到 user.update),
  // 批次资格用它算年龄 (RPA/民航等), IntakeGap 也把它列为必填.
  @ApiPropertyOptional({ description: '出生日期 (ISO 8601 字符串)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  parentPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  highSchool?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  county?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRural?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  examYear?: number;

  // --- 考试成绩 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(NewExamType)
  examType?: NewExamType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstChoice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  reChoices?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '语文成绩需在 0-150 之间' })
  @Max(150, { message: '语文成绩需在 0-150 之间' })
  scoreChinese?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '数学成绩需在 0-150 之间' })
  @Max(150, { message: '数学成绩需在 0-150 之间' })
  scoreMath?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '英语成绩需在 0-150 之间' })
  @Max(150, { message: '英语成绩需在 0-150 之间' })
  scoreEnglish?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '首选科目成绩需在 0-100 之间' })
  @Max(100, { message: '首选科目成绩需在 0-100 之间' })
  scoreFirstChoice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '再选科目成绩需在 0-100 之间' })
  @Max(100, { message: '再选科目成绩需在 0-100 之间' })
  scoreSub1?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '再选科目成绩需在 0-100 之间' })
  @Max(100, { message: '再选科目成绩需在 0-100 之间' })
  scoreSub2?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0, { message: '总分需在 0-750 之间' })
  @Max(750, { message: '总分需在 0-750 之间' })
  totalScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1, { message: '全省位次需为正整数' })
  provincialRank?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ExamSource)
  examSource?: ExamSource;

  // --- 身体条件 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(100, { message: '身高需在 100-250cm 之间' })
  @Max(250, { message: '身高需在 100-250cm 之间' })
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(20, { message: '体重需在 20-200kg 之间' })
  @Max(200, { message: '体重需在 20-200kg 之间' })
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vision?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  colorBlind?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  colorWeak?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  physicalLimits?: string[];

  // --- 升学规划 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(PriorityMode)
  priorityMode?: PriorityMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(CareerPlan)
  careerPlan?: CareerPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerDirection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  militaryInterest?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  teacherInterest?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(StayPreference)
  stayPreference?: StayPreference;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(StayPreference)
  stayInProvince?: StayPreference;

  // --- 正向偏好 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredProvinces?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredCities?: string[];

  @ApiPropertyOptional({
    description: '意向专业梯队 [{tier, majors}]; 兼容旧扁平 string[] (自动包成意向池 tier=0)',
    type: [PreferredMajorTierDto],
  })
  @IsOptional()
  // 从原始 payload (obj) 取值; 旧扁平 string[] 自动升格为意向池。
  // @Transform 会覆盖 @Type 的元素实例化, 必须在这里自己 plainToInstance,
  // 否则 ValidateNested + whitelist 把 plain object 的 tier/majors 当未知属性拒掉
  @Transform(({ obj }) => {
    const raw = obj?.preferredMajors;
    if (!Array.isArray(raw)) return raw;
    const tiers =
      raw.length > 0 && raw.every((m: unknown) => typeof m === 'string')
        ? [{ tier: 0, majors: raw }]
        : raw;
    return tiers.map((t: unknown) => plainToInstance(PreferredMajorTierDto, t));
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferredMajorTierDto)
  preferredMajors?: PreferredMajorTierDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredUniversities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredMajorCategories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredUniversityTypes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredTags?: string[];

  // --- 反向排除 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  excludedProvinces?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  excludedCities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  excludedUniversities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  excludedMajors?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  excludedMajorCategories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(AcceptLevel)
  acceptLevel?: AcceptLevel;

  // --- 经济条件 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(TuitionBudget)
  tuitionBudget?: TuitionBudget;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptSinoForeign?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(AcceptLevel)
  acceptPrivate?: AcceptLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(AcceptLevel)
  acceptCooperation?: AcceptLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  otherRequirements?: string;

  // --- 兴趣性格 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personalityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selfDescription?: string;

  // --- V1 新增：政治面貌（②）---

  @ApiPropertyOptional({ enum: PoliticalStatus })
  @IsOptional()
  @IsEnum(PoliticalStatus)
  politicalStatus?: PoliticalStatus;

  // --- V1 新增：高考所在地（① 老师独占）---

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationProvince?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examLocationCounty?: string;

  // --- V1 新增：视力详细（②）---

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1, { message: '裸眼视力需在 1.0-5.3 之间（五分记录法）' })
  @Max(5.3, { message: '裸眼视力需在 1.0-5.3 之间（五分记录法）' })
  visionLeft?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1, { message: '裸眼视力需在 1.0-5.3 之间（五分记录法）' })
  @Max(5.3, { message: '裸眼视力需在 1.0-5.3 之间（五分记录法）' })
  visionRight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionLeftCorrected?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  visionRightCorrected?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicalHistory?: string;

  // --- V1 新增：加分政策（① 老师独占）---

  @ApiPropertyOptional({ enum: BonusPolicyStatus })
  @IsOptional()
  @IsEnum(BonusPolicyStatus)
  bonusPolicyStatus?: BonusPolicyStatus;

  @ApiPropertyOptional({ type: [BonusItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusItemDto)
  bonusItems?: BonusItemDto[];

  // --- V1 新增：意向批次（②）---

  @ApiPropertyOptional({ description: '意向批次（batch_config 中的 batch 字段值，多省份扩展友好）', isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredBatches?: string[];

  // --- V1 新增：偏远 / 冷门接受度（②）---

  @ApiPropertyOptional({ enum: RemoteAreaAcceptance })
  @IsOptional()
  @IsEnum(RemoteAreaAcceptance)
  remoteAreaAcceptance?: RemoteAreaAcceptance;

  @ApiPropertyOptional({ enum: ColdMajorAcceptance })
  @IsOptional()
  @IsEnum(ColdMajorAcceptance)
  coldMajorAcceptance?: ColdMajorAcceptance;

  // --- V1 新增：填表元信息（③ 学生端独有）---

  @ApiPropertyOptional({ enum: FormFiller })
  @IsOptional()
  @IsEnum(FormFiller)
  formFiller?: FormFiller;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  parentSignedAt?: Date;
}
