import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUsernameDto {
  @ApiProperty({ description: '新用户名', example: '001' })
  @IsString()
  @MinLength(3, { message: '用户名至少 3 位' })
  @MaxLength(50)
  username: string;
}
