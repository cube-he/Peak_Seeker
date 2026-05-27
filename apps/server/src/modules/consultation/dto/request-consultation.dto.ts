import { IsString, IsOptional, IsDateString, IsIn, IsInt, Min } from 'class-validator';

export class RequestConsultationDto {
  @IsDateString()
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationEst?: number;

  @IsIn(['phone', 'wechat', 'in_person', 'video'])
  channel: 'phone' | 'wechat' | 'in_person' | 'video';

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
