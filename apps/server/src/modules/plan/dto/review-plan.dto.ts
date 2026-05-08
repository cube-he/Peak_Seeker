import { IsIn, IsString, IsOptional, IsArray } from 'class-validator';

export class ReviewPlanDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_CHANGE', 'COMMENT'])
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGE' | 'COMMENT';

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  itemAnnotations?: Array<{ sequence: number; annotation: string }>;
}
