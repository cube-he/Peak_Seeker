import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NewExamType,
  ExamSource,
  PriorityMode,
  CareerPlan,
  StayPreference,
  AcceptLevel,
  TuitionBudget,
} from '@prisma/client';

export class UpdateStudentProfileDto {
  @ApiProperty({ description: '数据版本号（乐观锁）' })
  @IsInt()
  dataVersion: number;

  // --- 基本信息 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  scoreChinese?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  scoreMath?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  scoreEnglish?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  scoreFirstChoice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  scoreSub1?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  scoreSub2?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  totalScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  provincialRank?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(ExamSource)
  examSource?: ExamSource;

  // --- 身体条件 ---

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  preferredMajors?: string[];

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
}
