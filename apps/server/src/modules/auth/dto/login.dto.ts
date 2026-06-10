import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'zhangsan' })
  @IsString({ message: '请输入用户名' })
  username: string;

  @ApiProperty({ description: '密码', example: 'Password123!' })
  @IsString({ message: '请输入密码' })
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
