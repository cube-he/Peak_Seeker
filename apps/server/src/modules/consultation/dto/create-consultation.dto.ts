import { IsInt, IsString, IsOptional, IsDateString, IsIn, Min } from 'class-validator';

export class CreateConsultationDto {
  @IsInt()
  @Min(1)
  studentId: number;

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
