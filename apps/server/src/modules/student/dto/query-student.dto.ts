import { IsString, IsOptional, IsInt, IsEnum, IsIn, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StudentStatus } from '@prisma/client';

export class QueryStudentDto {
  @ApiPropertyOptional({ description: '学生状态筛选' })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;

  @ApiPropertyOptional({ description: '搜索关键词（姓名/用户名）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '学生老师归属筛选',
    enum: ['ALL', 'ASSIGNED', 'UNASSIGNED'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'ASSIGNED', 'UNASSIGNED'])
  assignmentStatus?: 'ALL' | 'ASSIGNED' | 'UNASSIGNED';

  @ApiPropertyOptional({ description: '按老师档案 ID 筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teacherProfileId?: number;

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
