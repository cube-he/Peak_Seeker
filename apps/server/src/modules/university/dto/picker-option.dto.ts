import { ApiProperty } from '@nestjs/swagger';

export class UniversityPickerOptionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: '院校代码', nullable: true })
  code!: string | null;

  @ApiProperty({ description: '院校名称' })
  name!: string;
}
