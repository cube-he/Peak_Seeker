'use client';

import { Button } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  SORT_KEY_OPTIONS, SORT_PRESETS, defaultDirOf,
  type SortKey, type SortDir, type SortRule,
} from './plan-sort';

export interface PlanSortPanelProps {
  rules: SortRule[];
  gradientDir: SortDir;           // 段序: asc=冲→稳→保, desc=保→稳→冲(仅预览)
  preview: boolean;
  canApply: boolean;              // 仅 DRAFT 可写回
  onRulesChange: (rules: SortRule[]) => void;
  onGradientDirChange: (dir: SortDir) => void;
  onPreview: () => void;
  onRestore: () => void;
  onApply: () => void;
}

export default function PlanSortPanel({
  rules, gradientDir, preview, canApply,
  onRulesChange, onGradientDirChange, onPreview, onRestore, onApply,
}: PlanSortPanelProps) {
  const usedKeys = new Set(rules.map((r) => r.key));
  const firstUnused = SORT_KEY_OPTIONS.find((o) => !usedKeys.has(o.key));

  const setRuleKey = (idx: number, key: SortKey) =>
    onRulesChange(rules.map((r, i) => (i === idx ? { key, dir: defaultDirOf(key) } : r)));
  const setRuleDir = (idx: number, dir: SortDir) =>
    onRulesChange(rules.map((r, i) => (i === idx ? { ...r, dir } : r)));
  const removeRule = (idx: number) => onRulesChange(rules.filter((_, i) => i !== idx));
  const addRule = () => firstUnused && onRulesChange([...rules, { key: firstUnused.key, dir: firstUnused.defaultDir }]);

  return (
    <div style={{ width: 360, maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 快捷预设 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SORT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onRulesChange(p.rules)}
            style={chipStyle}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 梯度固定第一级(分组层) */}
      <div style={ruleRowStyle}>
        <span style={{ flex: 1, fontWeight: 600 }}>① 梯度（分组）</span>
        <div style={dirGroupStyle} role="group" aria-label="段序方向">
          {([['asc', '冲→保'], ['desc', '保→冲']] as const).map(([d, txt]) => (
            <button key={d} type="button" onClick={() => onGradientDirChange(d)} style={dirBtnStyle(gradientDir === d)}>
              {txt}
            </button>
          ))}
        </div>
      </div>

      {/* 段内排序栈 */}
      {rules.map((rule, idx) => {
        const opt = SORT_KEY_OPTIONS.find((o) => o.key === rule.key);
        return (
          <div key={idx} style={ruleRowStyle}>
            <span style={{ width: 18, color: '#8c8c8c' }}>{idx + 2}</span>
            <select
              value={rule.key}
              onChange={(e) => setRuleKey(idx, e.target.value as SortKey)}
              style={{ flex: 1, padding: '4px 6px', borderRadius: 6, border: '1px solid #d9d9d9' }}
            >
              {SORT_KEY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} disabled={usedKeys.has(o.key) && o.key !== rule.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <div style={dirGroupStyle} role="group" aria-label="排序方向">
              {([['asc', opt?.dir.asc ?? '升'], ['desc', opt?.dir.desc ?? '降']] as const).map(([d, txt]) => (
                <button key={d} type="button" onClick={() => setRuleDir(idx, d as SortDir)} style={dirBtnStyle(rule.dir === d)}>
                  {txt}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => removeRule(idx)} aria-label="删除该级" style={iconBtnStyle}>
              <DeleteOutlined />
            </button>
          </div>
        );
      })}

      <Button size="small" type="dashed" icon={<PlusOutlined />} disabled={!firstUnused} onClick={addRule} block>
        加一级排序
      </Button>

      {/* 动作 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {preview ? (
          <Button size="small" onClick={onRestore}>恢复手动顺序</Button>
        ) : (
          <Button size="small" type="primary" ghost onClick={onPreview} disabled={!rules.length}>预览</Button>
        )}
        <Button
          size="small"
          type="primary"
          onClick={onApply}
          disabled={!canApply || !rules.length}
          title={canApply ? '' : '仅草稿状态可写回顺序'}
          style={{ marginLeft: 'auto' }}
        >
          应用为志愿顺序
        </Button>
      </div>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  border: '1px solid #d9d9d9', borderRadius: 14, padding: '2px 10px',
  fontSize: 12, background: '#fff', cursor: 'pointer', color: '#595959',
};
const ruleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const dirGroupStyle: React.CSSProperties = {
  display: 'inline-flex', border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden',
};
const dirBtnStyle = (active: boolean): React.CSSProperties => ({
  border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 12, lineHeight: 1.5,
  background: active ? '#1677ff' : '#fff', color: active ? '#fff' : '#595959',
});
const iconBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer', color: '#bfbfbf', padding: 4,
};
