import { ApiProperty } from '@nestjs/swagger';

export class BatchPickerOptionDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() order!: number;
}
