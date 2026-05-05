import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';

export class PoiQueryDto {
  @IsEnum(['subway', 'mall', 'airport'], {
    message: 'category must be one of: subway, mall, airport',
  })
  category: 'subway' | 'mall' | 'airport';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
