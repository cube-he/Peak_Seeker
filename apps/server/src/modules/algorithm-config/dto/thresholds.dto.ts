import { IsNumber, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class RangeDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  min!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(5)
  max!: number;
}

export class ThresholdsDto {
  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  rush!: RangeDto;

  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  safe!: RangeDto;

  @ApiProperty({ type: RangeDto })
  @ValidateNested()
  @Type(() => RangeDto)
  stable!: RangeDto;
}
