import {
  IsString,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({ description: '用户名', minLength: 3, maxLength: 50 })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @ApiProperty({ description: '密码', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '真实姓名' })
  @IsString()
  realName: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '性别' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: '民族' })
  @IsOptional()
  @IsString()
  ethnicity?: string;

  @ApiPropertyOptional({ description: '高中' })
  @IsOptional()
  @IsString()
  highSchool?: string;

  @ApiPropertyOptional({ description: '班级' })
  @IsOptional()
  @IsString()
  classInfo?: string;

  @ApiPropertyOptional({ description: '城市' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: '高考年份' })
  @IsOptional()
  @IsInt()
  examYear?: number;
}
