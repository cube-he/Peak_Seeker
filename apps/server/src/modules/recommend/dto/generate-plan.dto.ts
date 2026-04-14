import {
  IsInt,
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePlanDto {
  @ApiPropertyOptional({ description: '批次', example: '本科一批' })
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional({
    description: '优先模式',
    enum: ['UNIVERSITY_FIRST', 'MAJOR_FIRST', 'CITY_FIRST', 'BALANCED'],
  })
  @IsOptional()
  @IsString()
  priorityMode?: string;

  @ApiPropertyOptional({ description: '算法参数覆盖' })
  @IsOptional()
  @IsObject()
  overrides?: {
    rangeUp?: number;
    rangeDown?: number;
    totalGroups?: number;
    bonusRules?: Record<string, number>;
  };
}

export class ReplaceItemDto {
  @ApiPropertyOptional({ description: '返回建议数量', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  topN?: number;
}

export class ExportPlanDto {
  @ApiProperty({
    description: '导出格式',
    enum: ['excel_full', 'excel_compact', 'pdf'],
  })
  @IsString()
  format: string;
}

export class BatchUpdateScoresDto {
  @ApiProperty({
    description: '学生成绩更新列表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        studentId: { type: 'number' },
        totalScore: { type: 'number' },
        provincialRank: { type: 'number' },
      },
    },
  })
  updates: {
    studentId: number;
    totalScore: number;
    provincialRank?: number;
  }[];

  @ApiPropertyOptional({ description: '是否自动重新生成方案', default: false })
  @IsOptional()
  autoRegenerate?: boolean;
}
