import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SoftFailReasonDto {
  @IsString()
  rule: string;

  @IsOptional()
  @Allow()
  expected?: string | number | null;

  @IsOptional()
  @Allow()
  actual?: string | number | null;

  @IsString()
  severity: string;

  @IsString()
  note: string;
}

export class SelectedPlanMajorDto {
  @Type(() => Number) @IsInt() @Min(1) order: number;
  @Type(() => Number) @IsInt() enrollmentPlanId: number;
  @Type(() => Number) @IsInt() majorId: number;
  @IsString() majorName: string;
  @IsOptional() @IsString() majorCode?: string | null;
  @IsOptional() @IsIn(['RECOMMENDED', 'BACKUP', 'RISK']) displaySection?: 'RECOMMENDED' | 'BACKUP' | 'RISK';
  @IsOptional() @IsString() displayReason?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() majorMinScore?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() majorMinRank?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() planCount?: number | null;
}

export class AddPlanItemDto {
  @Type(() => Number) @IsInt() enrollmentPlanId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sequence?: number;
  @IsOptional() @IsIn(['CHONG', 'WEN', 'BAO']) gradient?: 'CHONG' | 'WEN' | 'BAO';
  @IsOptional() @IsBoolean() acceptAdjust?: boolean;
  @IsOptional() @IsString() selectionReason?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SoftFailReasonDto)
  softFailReasons?: SoftFailReasonDto[];
  @IsOptional() @IsBoolean() softFailOverrideConfirmed?: boolean;
  @IsOptional() @IsString() overrideReason?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SelectedPlanMajorDto)
  selectedMajors?: SelectedPlanMajorDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedPlanMajorDto)
  candidateMajorRanking?: SelectedPlanMajorDto[];
}
