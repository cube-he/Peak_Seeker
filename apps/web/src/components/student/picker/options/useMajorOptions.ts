import { useQuery } from '@tanstack/react-query';
import { pickerApi } from '@/services/picker';
import type { PickerOption } from '../AutoSavePicker';

export function useMajorOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['picker-options', 'majors'],
    queryFn: () => pickerApi.majors(),
    staleTime: Infinity,
  });
  const options: PickerOption[] = (data ?? []).map((m) => ({
    label: m.name,
    value: m.name,
    levels: m.levels ?? null,
  }));
  return { data: options, isLoading };
}
