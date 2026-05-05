import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 加分项明细：高考加分政策的单条记录 */
export class BonusItemDto {
  @ApiProperty({ description: '加分类型，如"少数民族"、"烈士子女"' })
  @IsString()
  type: string;

  @ApiProperty({ description: '加分值', example: 5 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ description: '来源/备注' })
  @IsOptional()
  @IsString()
  source?: string;
}
