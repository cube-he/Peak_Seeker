import { IsString, IsOptional, IsDateString, IsIn, IsInt, Min } from 'class-validator';

export class RequestConsultationDto {
  @IsDateString({}, { message: '预约时间格式不正确' })
  scheduledAt: string;

  @IsOptional()
  @IsInt({ message: '预估时长必须是整数' })
  @Min(1, { message: '预估时长不能小于 1 分钟' })
  durationEst?: number;

  // 用中文 message, 避免家长看到 "channel must be one of phone, wechat, in_person, video"
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
