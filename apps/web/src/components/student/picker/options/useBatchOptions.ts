import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useBatchOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'batches', 2026, '四川'],
    queryFn: () => pickerApi.batches(2026, '四川'),
    staleTime: Infinity,
  });
  // 后端已按 admissionOrder 排序，前端直接 map；value 用 code（batch 名），不用 order
  const options: PickerOption[] = (data ?? []).map((b) => ({
    label: b.name,
    value: b.code,
  }));
  return { data: options, isLoading };
}
