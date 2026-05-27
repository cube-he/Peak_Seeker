import { IsArray, IsOptional, IsString, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ItemAnnotationDto {
  @IsInt()
  @Min(1)
  sequence: number;

  @IsString()
  annotation: string;
}

export class UpsertReviewDraftDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAnnotationDto)
  itemAnnotations?: ItemAnnotationDto[];
}
