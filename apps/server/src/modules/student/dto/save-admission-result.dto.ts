import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MAX_DATABASE_ID = 2_147_483_647;
const MAX_ADMISSION_RANK = 100_000_000;
const MAX_ADMISSION_SEQUENCE = 1_000;

function trimString({ obj, key }: TransformFnParams) {
  const rawValue = obj?.[key];
  return typeof rawValue === 'string' ? rawValue.trim() : rawValue;
}

function normalizeNullableString({ obj, key }: TransformFnParams) {
  const rawValue = obj?.[key];
  if (typeof rawValue !== 'string') return rawValue;
  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * class-transformer 在启用隐式数字转换时会把空字符串转成 0。
 * 使用原始对象判断空字符串，确保可选数字字段仍按“未填写”处理。
 */
function normalizeNullableNumber({ value, obj, key }: TransformFnParams) {
  const rawValue = obj?.[key];
  if (
    rawValue === null ||
    rawValue === undefined ||
    (typeof rawValue === 'string' && rawValue.trim() === '')
  ) {
    return typeof rawValue === 'string' ? null : rawValue;
  }
  if (typeof rawValue === 'string') {
    return Number(rawValue);
  }
  return value;
}

export class SaveAdmissionResultDto {
  @ApiProperty({ description: '录取院校名称', maxLength: 200 })
  @Transform(trimString)
  @IsString({ message: '录取院校必须是字符串' })
  @IsNotEmpty({ message: '请填写录取院校' })
  @MaxLength(200, { message: '录取院校不能超过 200 个字符' })
  admittedUniName!: string;

  @ApiPropertyOptional({ description: '录取院校 ID', nullable: true })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取院校 ID 必须是整数' })
  @Min(1, { message: '录取院校 ID 必须是正整数' })
  @Max(MAX_DATABASE_ID, { message: '录取院校 ID 超出有效范围' })
  admittedUniId?: number | null;

  @ApiPropertyOptional({
    description: '录取最低分',
    minimum: 0,
    maximum: 750,
    nullable: true,
  })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取最低分必须是整数' })
  @Min(0, { message: '录取最低分不能小于 0' })
  @Max(750, { message: '录取最低分不能超过 750' })
  admittedMinScore?: number | null;

  @ApiPropertyOptional({ description: '录取最低位次', nullable: true })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取最低位次必须是整数' })
  @Min(1, { message: '录取最低位次必须是正整数' })
  @Max(MAX_ADMISSION_RANK, { message: '录取最低位次超出有效范围' })
  admittedMinRank?: number | null;

  @ApiPropertyOptional({ description: '录取志愿顺序', nullable: true })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取志愿顺序必须是整数' })
  @Min(1, { message: '录取志愿顺序必须是正整数' })
  @Max(MAX_ADMISSION_SEQUENCE, { message: '录取志愿顺序超出有效范围' })
  sequenceNo?: number | null;

  @ApiPropertyOptional({ description: '录取凭证附件 ID', nullable: true })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取凭证附件 ID 必须是整数' })
  @Min(1, { message: '录取凭证附件 ID 必须是正整数' })
  @Max(MAX_DATABASE_ID, { message: '录取凭证附件 ID 超出有效范围' })
  proofAttachmentId?: number | null;

  @ApiPropertyOptional({
    description: '录取批次',
    maxLength: 100,
    nullable: true,
  })
  @Transform(normalizeNullableString)
  @IsOptional()
  @IsString({ message: '录取批次必须是字符串' })
  @MaxLength(100, { message: '录取批次不能超过 100 个字符' })
  batchName?: string | null;

  @ApiPropertyOptional({
    description: '录取院校专业组代码',
    maxLength: 10,
    nullable: true,
  })
  @Transform(normalizeNullableString)
  @IsOptional()
  @IsString({ message: '录取院校专业组代码必须是字符串' })
  @MaxLength(10, { message: '录取院校专业组代码不能超过 10 个字符' })
  admittedMajorGroupCode?: string | null;

  @ApiPropertyOptional({
    description: '录取专业代码',
    maxLength: 10,
    nullable: true,
  })
  @Transform(normalizeNullableString)
  @IsOptional()
  @IsString({ message: '录取专业代码必须是字符串' })
  @MaxLength(10, { message: '录取专业代码不能超过 10 个字符' })
  admittedMajorCode?: string | null;

  @ApiPropertyOptional({
    description: '录取专业名称',
    maxLength: 200,
    nullable: true,
  })
  @Transform(normalizeNullableString)
  @IsOptional()
  @IsString({ message: '录取专业名称必须是字符串' })
  @MaxLength(200, { message: '录取专业名称不能超过 200 个字符' })
  admittedMajorName?: string | null;

  @ApiPropertyOptional({ description: '录取专业 ID', nullable: true })
  @Transform(normalizeNullableNumber)
  @IsOptional()
  @IsInt({ message: '录取专业 ID 必须是整数' })
  @Min(1, { message: '录取专业 ID 必须是正整数' })
  @Max(MAX_DATABASE_ID, { message: '录取专业 ID 超出有效范围' })
  admittedMajorId?: number | null;
}
