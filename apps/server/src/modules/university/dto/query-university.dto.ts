import { IsString, IsOptional, IsInt, IsBoolean, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class QueryUniversityDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '省份' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: '院校类型' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '院校层次' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: '城市档次' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ description: '办学性质' })
  @IsOptional()
  @IsString()
  nature?: string;

  @ApiPropertyOptional({ description: '是否双一流' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isDoubleFirstClass?: boolean;

  @ApiPropertyOptional({ description: '是否985' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is985?: boolean;

  @ApiPropertyOptional({ description: '是否211' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is211?: boolean;

  @ApiPropertyOptional({
    description: '排序字段',
    enum: [
      'name', 'province', 'type',
      'minRank', 'tier', 'softRank',
      'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
      'aClassDisciplineCount', 'firstClassDisciplineCount',
      'employmentRate', 'avgSalary', 'furtherStudyRate',
      'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
      'campusArea', 'createdYear', 'heatScore', 'isFeatured',
    ],
  })
  @IsOptional()
  @IsIn([
    'name', 'province', 'type',
    'minRank', 'tier', 'softRank',
    'rankingAlumni', 'rankingQS', 'rankingUSNews', 'rankingTimes',
    'aClassDisciplineCount', 'firstClassDisciplineCount',
    'employmentRate', 'avgSalary', 'furtherStudyRate',
    'satisfactionOverall', 'satisfactionLife', 'satisfactionEnviron',
    'campusArea', 'createdYear', 'heatScore', 'isFeatured',
  ])
  sortBy?: string = 'softRank';

  @ApiPropertyOptional({ description: '排序方向', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ description: '科类', enum: ['物理', '历史'] })
  @IsOptional()
  @IsIn(['物理', '历史'])
  examType?: string;

  @ApiPropertyOptional({ description: '冲稳保筛选', enum: ['rush', 'stable', 'safe'] })
  @IsOptional()
  @IsIn(['rush', 'stable', 'safe'])
  tierFilter?: string;

  @ApiPropertyOptional({ description: '考生位次（冲稳保标签/筛选用）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  userRank?: number;

  @ApiPropertyOptional({ description: '院校背景 tag(如 C9联盟 / 卓越工程师 / 原邮电部直属)' })
  @IsOptional()
  hasTag?: string;
}
