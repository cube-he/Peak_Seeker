import { ApiProperty } from '@nestjs/swagger';

export class MajorPickerOptionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: '专业代码', nullable: true })
  code!: string | null;

  @ApiProperty({ description: '专业名称' })
  name!: string;
}
