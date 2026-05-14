import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SelectedPlanMajorDto } from './add-plan-item.dto';

export class UpdatePlanItemDto {
  @IsOptional() @IsInt() sequence?: number;
  @IsOptional() @IsIn(['CHONG', 'WEN', 'BAO']) gradient?: 'CHONG' | 'WEN' | 'BAO';
  @IsOptional() @IsBoolean() acceptAdjust?: boolean;
  @IsOptional() @IsString() selectionReason?: string;
  @IsOptional() @IsString() riskWarning?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
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
