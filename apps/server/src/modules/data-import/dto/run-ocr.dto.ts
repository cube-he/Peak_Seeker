import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsArray,
  IsOptional,
  IsIn,
  ArrayMinSize,
} from 'class-validator';

export class RunOcrDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageUrls: string[];

  @IsOptional()
  @IsString()
  @IsIn(['score_segment', 'supplementary'])
  dataType?: string = 'score_segment';

  @IsInt()
  year: number;

  @IsOptional()
  @IsString()
  province?: string = '四川';

  @IsOptional()
  @IsString()
  examType?: string = '物理类';

  @IsOptional()
  @IsString()
  batch?: string = '本科一批';

  @IsOptional()
  @IsString()
  sourceUrl?: string = '';  // 数据来源网页 URL

  @IsOptional()
  @IsString()
  @IsIn(['baidu', 'paddleocr_vl', 'aistudio', 'paddleocr', 'rapid'])
  engine?: string;  // 指定 OCR 引擎
}
