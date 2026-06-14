import api from './api';
import type { OptionLevels } from '@/lib/level-mismatch';

export interface UniversityPickerOption { id: number; code: string | null; name: string; renameHistory?: string | null; levels?: OptionLevels | null; }
export interface MajorPickerOption { id: number; code: string | null; name: string; levels?: OptionLevels | null; }
export interface BatchPickerOption { code: string; name: string; order: number; }

export const pickerApi = {
  universities(): Promise<UniversityPickerOption[]> {
    return api.get('/universities/picker-options') as any;
  },
  majors(): Promise<MajorPickerOption[]> {
    return api.get('/majors/picker-options') as any;
  },
  batches(year = 2026, province = '四川'): Promise<BatchPickerOption[]> {
    return api.get(
      `/batch-config/picker-options?serviceYear=${year}&province=${encodeURIComponent(province)}`,
    ) as any;
  },
};
