import { IsArray, IsInt } from 'class-validator';

export class ReorderPlanItemsDto {
  @IsArray() @IsInt({ each: true }) itemIds: number[];
}
