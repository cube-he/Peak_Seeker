'use client';
import { Checkbox, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

interface HealthCondition {
  conditionCode: string;
  conditionName: string;
  severity: string;
}

interface Props {
  value?: string[];
  onChange?: (codes: string[]) => void;
}

export default function HealthCheckboxGroup({ value, onChange }: Props) {
  const { data, isLoading } = useQuery<HealthCondition[]>({
    queryKey: ['health-restrictions'],
    queryFn: () => api.get('/health-restrictions') as unknown as Promise<HealthCondition[]>,
    // 体检受限条件不会频繁变动，缓存 24 小时避免重复请求
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (isLoading) {
    return <Spin size="small" />;
  }

  const options = (data ?? []).map((item) => ({
    // 超过 25 字截断，避免 checkbox 标签过长影响布局
    label: item.conditionName.length > 25 ? item.conditionName.slice(0, 25) + '…' : item.conditionName,
    value: item.conditionCode,
  }));

  return (
    <div className="space-y-2">
      <Checkbox.Group
        options={options}
        value={value}
        onChange={(checked) => onChange?.(checked as string[])}
        className="flex flex-wrap gap-y-2"
      />
      <Typography.Text type="secondary" className="text-xs">
        据此过滤不符合体检标准的专业，保护填报安全
      </Typography.Text>
    </div>
  );
}
