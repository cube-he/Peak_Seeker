/**
 * 专业组「决策信号 chip 行」—— 专业优先(CandidateCardV3)与院校优先(UniversityCandidateCard)两视图共用一份,
 * 保证同一个专业组在两种模式下显示的信息(纯净度 / 意向命中 / 征集 / 组变动 / 招生 vs 2025)口径完全一致。
 *
 * 历史教训: 这套 chip 早先在两个卡里各写一份, 久而久之口径漂移(院校优先纯净度显示档位文字而非百分比、
 * 征集用累计人数而非「Σ每年最大轮」、招生对比用 previousPlanCount 而非 2025 同专业录取数), 导致老师切换
 * 模式看到的数字对不上。抽到这里后两边只此一份, 不会再漂。
 */
import React from 'react';

// 客观纯净度档位 → 颜色 + 文案
export const PURITY_META: Record<string, { tone: string; label: string; desc: string }> = {
  S: { tone: 'safe', label: '干净', desc: '专业组高度纯净，几乎无调剂风险' },
  A: { tone: 'accent', label: '较纯', desc: '同门类、主导专业类 ≥70%' },
  B: { tone: 'rush-soft', label: '较乱', desc: '跨 2 门类有主导，需注意调剂' },
  C: { tone: 'rush', label: '混乱', desc: '冷热混装，调剂风险高' },
};

// 把 0~1 score 渲染为「X%」字符串。null/undefined → 空串(由调用方兜底)
export function purityPercent(score: number | null | undefined): string {
  if (typeof score !== 'number' || Number.isNaN(score)) return '';
  return `${Math.round(score * 100)}%`;
}

export function purityTitle(purity: any): string {
  if (!purity) return '';
  const m = PURITY_META[purity.level] ?? { desc: '' };
  const parts: string[] = [m.desc];
  if (typeof purity.score === 'number') parts.unshift(`专家版纯净度 ${Math.round(purity.score * 100)}%`);
  if (purity.majorCount) parts.push(`组内 ${purity.majorCount} 个专业`);
  if (purity.dominantDiscipline) {
    const pct = Math.round((purity.dominantDisciplineRatio ?? 0) * 100);
    parts.push(`主导 ${purity.dominantDiscipline} ${pct}%`);
  }
  if (purity.crossCategoryCount > 1) parts.push(`跨 ${purity.crossCategoryCount} 门类`);
  if (purity.mixedForeign) parts.push('混入中外合作');
  if (Array.isArray(purity.reasons) && purity.reasons[0]) parts.push(purity.reasons[0]);
  return parts.filter(Boolean).join(' · ');
}

// 2026 vs 2025 专业组变动 chip 元数据。'未变' 不渲染 chip(用户决策, 仅有变动时提示老师对照)。
export const CHANGE_META: Record<string, { tone: string; label: string }> = {
  '原组+新增':   { tone: 'safe-soft', label: '原组+新增' },
  '变干净(拆分)': { tone: 'safe',      label: '拆分' },
  '重组(合并)':  { tone: 'rush-soft', label: '重组' },
  '新组无对应':   { tone: 'rush',      label: '新组' },
};

// tooltip: 列出 2025 老组的专业构成(重组组多串各一行,逐顿点呈现)
export function changeTitle(group: any): string {
  const ct = group?.groupChangeType;
  if (!ct || ct === '未变') return '';
  const olds = (group.oldGroupMajors2025 as string[] | undefined) ?? [];
  const parts: string[] = [`相对 2025: ${ct}`];
  if (olds.length === 0) {
    if (ct === '新组无对应') parts.push('2025 年无对应组, 2026 新设');
  } else if (olds.length === 1) {
    parts.push(`2025 老组专业: ${olds[0]}`);
  } else {
    olds.forEach((s, i) => parts.push(`2025 老组 ${i + 1}: ${s}`));
  }
  return parts.join(' · ');
}

/**
 * 决策信号 chip 行(纯净度 / 意向命中 / 征集 / 组变动 / 招生 vs 2025)。
 * 返回 fragment(裸 chip), 由各卡片用自己的容器(tb-signals / grow-signals)包裹, 以适配各自布局。
 * preferredHitCount: 组内命中学生意向的专业数; undefined = 学生无意向, 不显示该 chip(与专业优先一致)。
 */
export function GroupSignalChips({ group, preferredHitCount }: { group: any; preferredHitCount?: number }) {
  const groupMajorCount = group?.purity?.majorCount ?? group?.majorCount ?? group?.majors?.length ?? 0;

  // 2026 招生 vs 2025 同专业录取数(组重组后唯一可比口径, 后端按 majorCode 回算 2025)。
  // delta=0 → tone-muted + "持平", 避免「+0」绿色误读为扩招。
  const admitVs2025 = (group?.currentPlanCount != null && group?.previousMajorsAdmissionSum2025 != null)
    ? (() => {
        const cur = group.currentPlanCount as number;
        const prev = group.previousMajorsAdmissionSum2025 as number;
        const delta = cur - prev;
        return {
          tone: delta === 0 ? 'muted' : delta > 0 ? 'safe' : 'rush',
          label: delta === 0
            ? `招生 ${cur} 人 (与 2025 持平)`
            : `招生 ${cur} 人 (${delta > 0 ? '+' : ''}${delta} vs 2025 同专业)`,
          title: `2026 招 ${cur} 人 vs 2025 同专业录取 ${prev} 人。口径: 取本组 2026 包含的专业, 在 2025 各自的录取人数求和`,
        };
      })()
    : null;

  return (
    <>
      {group?.purity?.level && PURITY_META[group.purity.level] ? (
        <span className={`pgv2-dchip tone-${PURITY_META[group.purity.level].tone}`} title={purityTitle(group.purity)}>
          纯净度 {purityPercent(group.purity.score) || PURITY_META[group.purity.level].label}
        </span>
      ) : null}
      {typeof preferredHitCount === 'number' ? (
        <span
          className={`pgv2-dchip ${preferredHitCount > 0 ? 'tone-safe' : 'tone-rush'}`}
          title="组内命中学生意向的专业数 / 组内专业总数, 命中越少服从调剂落到非意向的风险越高"
        >
          意向命中 {preferredHitCount}/{groupMajorCount}
        </span>
      ) : null}
      {group?.supplementary && (group.supplementaryMaxSum ?? 0) > 0 ? (() => {
        // 征集人数口径: Σ每年(该年多轮里的最大单轮人数)。逐年明细(各取该年 max round)放 tooltip。
        const byYear = group.supplementary.byYear ?? {};
        const perYear = Object.keys(byYear)
          .filter((y) => Array.isArray(byYear[y]?.rounds) && byYear[y].rounds.length)
          .sort()
          .map((y) => {
            const mx = Math.max(...byYear[y].rounds.map((r: any) => r.count ?? 0));
            return `${String(y).slice(2)}年${mx}人`;
          });
        return (
          <span
            className="pgv2-dchip tone-safe-soft"
            title={`征集人数 = 各年取该年多轮里的最大单轮人数, 再跨年求和${perYear.length ? `：${perYear.join(' + ')} = ${group.supplementaryMaxSum}人` : ''}。征集=没招满需补录, 常伴随降分, 是可达性的积极信号`}
          >
            征集 {group.supplementaryMaxSum}人{perYear.length ? `（${perYear.join(' / ')}）` : ''}
          </span>
        );
      })() : null}
      {group?.groupChangeType && group.groupChangeType !== '未变' && CHANGE_META[group.groupChangeType] ? (
        <span className={`pgv2-dchip tone-${CHANGE_META[group.groupChangeType].tone}`} title={changeTitle(group)}>组变动 · {CHANGE_META[group.groupChangeType].label}</span>
      ) : null}
      {admitVs2025 ? (
        <span className={`pgv2-dchip tone-${admitVs2025.tone}`} title={admitVs2025.title}>{admitVs2025.label}</span>
      ) : group?.currentPlanCount != null ? (
        <span className="pgv2-dchip tone-accent" title="本组 2026 招生计划及相对 2025 同专业增减">招生 {group.currentPlanCount} 人{group.planCountChange ? (group.planCountChange > 0 ? ` +${group.planCountChange}` : ` ${group.planCountChange}`) : ''}</span>
      ) : null}
    </>
  );
}
