import { ApiProperty } from '@nestjs/swagger';

export class UniversityPickerOptionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: '院校代码', nullable: true })
  code!: string | null;

  @ApiProperty({ description: '院校名称' })
  name!: string;

  @ApiProperty({ description: '更名历史 / 合并历史 (用于前端联想搜旧名)', nullable: true })
  renameHistory!: string | null;
}
