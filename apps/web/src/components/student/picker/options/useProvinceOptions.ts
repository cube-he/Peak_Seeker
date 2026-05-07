import { PROVINCES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = PROVINCES.map((p) => ({
  label: p.name,
  value: p.name, // 存中文名（向后兼容现有 preferredProvinces 数据）
}));

export function useProvinceOptions() {
  return { data: OPTIONS, isLoading: false };
}
