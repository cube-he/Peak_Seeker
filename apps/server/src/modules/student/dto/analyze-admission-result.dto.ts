import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MAX_DATABASE_ID = 2_147_483_647;

function toNumber({ value }: TransformFnParams) {
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
}

export class AnalyzeAdmissionResultDto {
  @ApiProperty({ description: '录取截图附件 ID' })
  @Transform(toNumber)
  @IsInt({ message: '录取截图附件 ID 必须是整数' })
  @Min(1, { message: '录取截图附件 ID 必须是正整数' })
  @Max(MAX_DATABASE_ID, { message: '录取截图附件 ID 超出有效范围' })
  proofAttachmentId!: number;

  @ApiPropertyOptional({
    description: '用于匹配的志愿填报 PDF 附件 ID；不传时使用最新 PDF',
  })
  @Transform(toNumber)
  @IsOptional()
  @IsInt({ message: '志愿填报附件 ID 必须是整数' })
  @Min(1, { message: '志愿填报附件 ID 必须是正整数' })
  @Max(MAX_DATABASE_ID, { message: '志愿填报附件 ID 超出有效范围' })
  submissionAttachmentId?: number;
}
