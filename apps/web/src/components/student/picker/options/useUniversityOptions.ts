import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useUniversityOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'universities'],
    queryFn: () => pickerApi.universities(),
    staleTime: Infinity,
  });
  // value 存名字，与现有 preferredUniversities 数据兼容
  const options: PickerOption[] = (data ?? []).map((u) => ({
    label: u.name,
    value: u.name,
    levels: u.levels ?? null,
  }));
  return { data: options, isLoading };
}
