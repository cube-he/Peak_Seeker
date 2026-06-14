import { ApiProperty } from '@nestjs/swagger';

export class MajorPickerOptionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: '专业代码', nullable: true })
  code!: string | null;

  @ApiProperty({ description: '专业名称' })
  name!: string;

  @ApiProperty({ description: '在川各科类层次 {phy,his}: 本科|专科|兼有|null', required: false, nullable: true })
  levels?: { phy: '本科' | '专科' | '兼有' | null; his: '本科' | '专科' | '兼有' | null } | null;
}
