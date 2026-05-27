import { IsString, IsOptional, IsDateString, IsIn, IsInt, Min } from 'class-validator';

export class UpdateConsultationDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationEst?: number;

  @IsOptional()
  @IsIn(['phone', 'wechat', 'in_person', 'video'])
  channel?: 'phone' | 'wechat' | 'in_person' | 'video';

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsIn(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'])
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsString()
  notes?: string;
}
