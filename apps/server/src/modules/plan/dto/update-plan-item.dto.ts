import { IsInt, IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdatePlanItemDto {
  @IsOptional() @IsInt() sequence?: number;
  @IsOptional() @IsIn(['CHONG', 'WEN', 'BAO']) gradient?: 'CHONG' | 'WEN' | 'BAO';
  @IsOptional() @IsBoolean() acceptAdjust?: boolean;
  @IsOptional() @IsString() selectionReason?: string;
  @IsOptional() @IsString() riskWarning?: string;
}
