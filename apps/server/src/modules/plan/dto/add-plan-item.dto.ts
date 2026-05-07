import { IsInt, Min, IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AddPlanItemDto {
  @Type(() => Number) @IsInt() enrollmentPlanId: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sequence?: number;
  @IsOptional() @IsIn(['CHONG', 'WEN', 'BAO']) gradient?: 'CHONG' | 'WEN' | 'BAO';
  @IsOptional() @IsBoolean() acceptAdjust?: boolean;
  @IsOptional() @IsString() selectionReason?: string;
}
