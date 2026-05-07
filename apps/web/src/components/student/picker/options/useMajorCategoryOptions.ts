import { MAJOR_SUB_CATEGORIES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = MAJOR_SUB_CATEGORIES.map((m) => ({
  label: m.name,
  value: m.name,
}));

export function useMajorCategoryOptions() {
  return { data: OPTIONS, isLoading: false };
}
