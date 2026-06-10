import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '原密码' })
  @IsString()
  @MinLength(6)
  oldPassword: string;

  @ApiProperty({ description: '新密码', example: '123456' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(50)
  newPassword: string;
}
