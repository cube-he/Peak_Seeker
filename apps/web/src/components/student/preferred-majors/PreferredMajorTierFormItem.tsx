'use client';

import { forwardRef, useMemo } from 'react';
import PreferredMajorTierEditor, {
  coerceTierShape,
} from './PreferredMajorTierEditor';
import type { PreferredMajorTier } from './types';

/**
 * antd Form.Item 适配器:
 *   - 接收 value (可能是新梯队 shape, 也可能是旧扁平 string[]) — 内部 coerce 到梯队
 *   - onChange 时不 normalize, 让用户能加空梯队再填专业 (之前 normalize 会立即
 *     剔除空梯队, 用户点 "+加梯队" 看起来没反应)
 *   - submit 前由 server / submit handler 自己 normalize (剔空梯队 / 去重)
 */
interface Props {
  value?: PreferredMajorTier[] | string[] | null;
  onChange?: (next: PreferredMajorTier[]) => void;
  options: Array<{ label: string; value: string; levels?: import('@/lib/level-mismatch').OptionLevels | null }>;
  isLoading?: boolean;
  eligibleLevel?: import('@/lib/level-mismatch').EligibleLevel;
  examType?: string | null;
}

const PreferredMajorTierFormItem = forwardRef<HTMLDivElement, Props>(
  function PreferredMajorTierFormItem({ value, onChange, options, isLoading, eligibleLevel, examType }, _ref) {
    const tiers = useMemo(() => coerceTierShape(value), [JSON.stringify(value)]);
    return (
      <PreferredMajorTierEditor
        value={tiers}
        options={options}
        onChange={(next) => onChange?.(next)}
        isLoading={isLoading}
        eligibleLevel={eligibleLevel}
        examType={examType}
      />
    );
  },
);

export default PreferredMajorTierFormItem;
