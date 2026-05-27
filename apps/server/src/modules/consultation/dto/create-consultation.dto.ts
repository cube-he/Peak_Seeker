import { IsInt, IsString, IsOptional, IsDateString, IsIn, Min } from 'class-validator';

// 老师侧创建预约 — 错误消息也用中文 (虽然主要面对老师, 但和 RequestConsultationDto 保持一致)
export class CreateConsultationDto {
  @IsInt({ message: 'studentId 必须是整数' })
  @Min(1, { message: 'studentId 必须 ≥ 1' })
  studentId: number;

  @IsDateString({}, { message: '预约时间格式不正确' })
  scheduledAt: string;

  @IsOptional()
  @IsInt({ message: '预估时长必须是整数' })
  @Min(1, { message: '预估时长不能小于 1 分钟' })
  durationEst?: number;

  @IsIn(['phone', 'wechat', 'in_person', 'video'], {
    message: '沟通方式只能是电话/微信/线下/视频',
  })
  channel: 'phone' | 'wechat' | 'in_person' | 'video';

  @IsOptional()
  @IsString({ message: '想聊什么需要是文字' })
  purpose?: string;

  @IsOptional()
  @IsString({ message: '备注需要是文字' })
  notes?: string;
}
