'use client';
import type { SubsetResult } from '@/services/batch-recommendations-api';
import { ReferencesList } from './ReferencesList';
import { TIcon } from './icons';
import { VERDICT_INFO, PASS_INFO } from './maps';

/**
 * §7.8.B 子类别项 (二层折叠) + §8.3 逐条规则.
 * 折叠态: 名 + verdict + 一句话原因 + chev
 * 展开态: description + rulesEval 列表 + references
 */
export function SubsetItem({
  subset,
  open,
  onToggle,
}: {
  subset: SubsetResult;
  open: boolean;
  onToggle: () => void;
}) {
  const v = VERDICT_INFO[subset.verdict] ?? { txt: subset.verdict, tone: 'pending' as const };

  // 折叠态一句话原因 (§7.8.B): 第一条 FAIL → 第一条 SOFT_HINT → description
  const fail = (subset.rulesEval ?? []).find(r => r.pass === 'FAIL');
  const soft = (subset.rulesEval ?? []).find(r => r.pass === 'SOFT_HINT');
  const reason = fail?.requirement ?? soft?.requirement ?? subset.description;

  return (
    <div className={`br-sub${open ? ' is-open' : ''}`}>
      <div className="br-sub-head" onClick={onToggle}>
        <span className="br-sub-name">{subset.name}</span>
        <span className={`br-sub-verdict tone-${v.tone}`}>{v.txt}</span>
        <span className="br-sub-reason">{reason}</span>
        <span className="br-sub-chev"><TIcon.chevRight/></span>
      </div>

      {open && (
        <div className="br-sub-body">
          <div className="br-sub-desc">{subset.description}</div>

          {/* 逐条规则 (§8.3 - 4 状态图标可区分; SOFT_HINT 蓝, FAIL 红 — D4) */}
          {subset.rulesEval && subset.rulesEval.length > 0 ? (
            <div className="br-rules">
              {subset.rulesEval.map((r, i) => {
                const p = PASS_INFO[r.pass] ?? { icon: '·', tone: 'soft' as const };
                return (
                  <div className="br-rule" key={i}>
                    <span className={`br-rule-ic t-${p.tone}`}>{p.icon}</span>
                    <span className="br-rule-txt">
                      <span className="req">{r.requirement}:</span>
                      <span className="actual">{r.actual}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="br-rules-empty">暂无逐条规则 (规则数据待完善)</div>
          )}

          <ReferencesList references={subset.references} />
        </div>
      )}
    </div>
  );
}
