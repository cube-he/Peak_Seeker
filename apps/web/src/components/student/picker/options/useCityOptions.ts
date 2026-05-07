import { CITIES } from '@volunteer-helper/shared';
import type { PickerOption } from '../AutoSavePicker';

const OPTIONS: PickerOption[] = CITIES.map((c) => ({
  label: c.name,
  value: c.name,
}));

export function useCityOptions() {
  return { data: OPTIONS, isLoading: false };
}
