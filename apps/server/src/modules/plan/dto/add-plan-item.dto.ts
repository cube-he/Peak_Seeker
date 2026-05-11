import {
  Allow,
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
}
