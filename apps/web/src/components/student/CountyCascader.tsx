'use client';
import { Input } from 'antd';

interface Props {
  value?: string | null;
  onChange?: (county: string) => void;
}

// 简单文本输入，区县验证留给后端 eligible_regions API 处理
export default function CountyCascader({ value, onChange }: Props) {
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder="请输入区县名称（如：邛崃市）"
      allowClear
    />
  );
}
