'use client';

import { useState } from 'react';
import { Button, Select, Tag, Space } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import type { PreferredMajorTier } from './types';

interface Props {
  value: PreferredMajorTier[];
  options: Array<{ label: string; value: string }>;
  onChange: (next: PreferredMajorTier[]) => void;
  isLoading?: boolean;
}

// 把任意 shape 的值转成 PreferredMajorTier[]:
//   - 新 shape ({tier, majors}[]): 验证每项有 majors 数组, 返回
//   - 旧 shape A (string[]): 按数组顺序拆梯队 (1 个一梯队)
//   - 旧 shape B (string[][]): 嵌套数组 = 多梯队
//   - null / undefined / 非数组: 空数组
export function coerceTierShape(value: unknown): PreferredMajorTier[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  if (typeof value[0] === 'string') {
    return (value as string[]).map((m, i) => ({ tier: i + 1, majors: [m] }));
  }
  if (Array.isArray(value[0])) {
    // 嵌套数组旧格式: [[majors of tier 1], [majors of tier 2], ...]
    return (value as string[][]).map((majors, i) => ({
      tier: i + 1,
      majors: Array.isArray(majors) ? majors.filter((m) => typeof m === 'string') : [],
    }));
  }
  // 假设是 {tier, majors}[] 结构, 但 defensively guard against missing majors
  return (value as any[]).map((t, i) => ({
    tier: typeof t?.tier === 'number' ? t.tier : i + 1,
    majors: Array.isArray(t?.majors) ? t.majors.filter((m: unknown) => typeof m === 'string') : [],
  }));
}

// submit 前规范化:
//   1. 剔除空梯队 (没专业的梯队)
//   2. 跨梯队同专业去重 (以前梯队为准, 即第一次出现的位置保留)
//   3. renumber 梯队 (确保 tier 从 1 开始连续)
export function normalize(tiers: PreferredMajorTier[]): PreferredMajorTier[] {
  const seen = new Set<string>();
  const out: PreferredMajorTier[] = [];
  for (const t of tiers) {
    const majors: string[] = [];
    for (const m of t.majors ?? []) {
      if (typeof m === 'string' && m.trim() && !seen.has(m)) {
        seen.add(m);
        majors.push(m);
      }
    }
    if (majors.length > 0) {
      out.push({ tier: out.length + 1, majors });
    }
  }
  return out;
}

export default function PreferredMajorTierEditor({ value, options, onChange, isLoading }: Props) {
  // adding 记录"当前哪个梯队正在加专业", null = 没有
  const [adding, setAdding] = useState<number | null>(null);

  const addTier = () => {
    onChange([...value, { tier: value.length + 1, majors: [] }]);
  };
  const removeTier = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier: i + 1 })));
  };
  const addMajor = (idx: number, major: string) => {
    if (!major) return;
    const next = [...value];
    if (!next[idx].majors.includes(major)) {
      next[idx] = { ...next[idx], majors: [...next[idx].majors, major] };
    }
    onChange(next);
    setAdding(null);
  };
  const removeMajor = (idx: number, major: string) => {
    const next = [...value];
    next[idx] = { ...next[idx], majors: next[idx].majors.filter((m) => m !== major) };
    onChange(next);
  };

  // 跨所有梯队已选的专业, 加专业时从 options 里剔除
  const selectedSet = new Set(value.flatMap((t) => t.majors));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((t, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 6,
            borderRadius: 4,
            background: '#fafafa',
          }}
        >
          <span style={{ minWidth: 56, color: '#666', fontWeight: 600 }}>
            梯队 {t.tier}
          </span>
          <Space wrap size={[4, 4]} style={{ flex: 1 }}>
            {t.majors.map((m) => (
              <Tag
                key={m}
                closable
                closeIcon={<CloseOutlined />}
                onClose={(e) => {
                  e.preventDefault();
                  removeMajor(idx, m);
                }}
                color="green"
              >
                {m}
              </Tag>
            ))}
            {adding === idx ? (
              <Select
                showSearch
                autoFocus
                size="small"
                style={{ minWidth: 200 }}
                placeholder="搜索专业"
                options={options.filter((o) => !selectedSet.has(o.value))}
                optionFilterProp="label"
                loading={isLoading}
                onSelect={(v) => addMajor(idx, v as string)}
                onBlur={() => setAdding(null)}
              />
            ) : (
              <Button
                size="small"
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setAdding(idx)}
              >
                加专业
              </Button>
            )}
          </Space>
          <Button size="small" type="text" danger onClick={() => removeTier(idx)}>
            删除梯队
          </Button>
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        onClick={addTier}
        style={{ width: 'fit-content' }}
      >
        加梯队
      </Button>
    </div>
  );
}
