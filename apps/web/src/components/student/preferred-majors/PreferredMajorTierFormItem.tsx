'use client';

import { forwardRef, useMemo } from 'react';
import PreferredMajorTierEditor, {
  coerceTierShape,
  normalize,
} from './PreferredMajorTierEditor';
import type { PreferredMajorTier } from './types';

/**
 * antd Form.Item 适配器:
 *   - 接收 value (可能是新梯队 shape, 也可能是旧扁平 string[]) — 内部 coerce 到梯队
 *   - onChange 时 normalize 后 propagate, 让 form.values 始终是规范化的梯队 shape
 *
 * 用法 (老师端学生详情 / 学生端 profile 编辑都能用):
 *   <Form.Item name="preferredMajors" label="意向专业">
 *     <PreferredMajorTierFormItem options={majorOptions} isLoading={isMajorLoading} />
 *   </Form.Item>
 */
interface Props {
  value?: PreferredMajorTier[] | string[] | null;
  onChange?: (next: PreferredMajorTier[]) => void;
  options: Array<{ label: string; value: string }>;
  isLoading?: boolean;
}

const PreferredMajorTierFormItem = forwardRef<HTMLDivElement, Props>(
  function PreferredMajorTierFormItem({ value, onChange, options, isLoading }, _ref) {
    const tiers = useMemo(() => coerceTierShape(value), [JSON.stringify(value)]);
    const handleChange = (next: PreferredMajorTier[]) => {
      onChange?.(normalize(next));
    };
    return (
      <PreferredMajorTierEditor
        value={tiers}
        options={options}
        onChange={handleChange}
        isLoading={isLoading}
      />
    );
  },
);

export default PreferredMajorTierFormItem;
