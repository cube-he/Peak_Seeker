import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'zhangsan' })
  @IsString()
  username: string;

  @ApiProperty({ description: '密码', example: 'Password123!' })
  @IsString()
  @MinLength(6)
  password: string;
}
