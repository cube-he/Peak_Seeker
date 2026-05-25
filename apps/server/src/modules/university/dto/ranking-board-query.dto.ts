import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RankingBoardQueryDto {
  @ApiPropertyOptional({ description: '科类', enum: ['物理', '历史'], default: '物理' })
  @IsOptional()
  @IsIn(['物理', '历史'])
  examType?: string = '物理';
}
