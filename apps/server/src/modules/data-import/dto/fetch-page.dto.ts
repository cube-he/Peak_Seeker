import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class FetchPageDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  @IsIn(['score_segment', 'admission'])
  dataType?: string = 'score_segment';
}
