/**
 * 候选卡 v3 — 完全复刻新设计稿 plan-generate.jsx 的 pgv2-card 结构:
 *   - MatchHeader (匹配环 + 理由 + 4 偏好 dots + 趋势 sparkline + 预测位次)
 *   - candidate top (院校 + 8 段梯度 chip + tags + 选科/计划/最低 + 操作)
 *   - MetricStrip 6 项就业指标 (招生/考研/深造/就业/薪资/满意度)
 *   - 展开 3 Tab 框架 (Tab 内容由父组件 renderExpandedContent 提供 → 复用现有
 *     CandidateMajorSection / EvidenceItem / UniversityBadges 真实字段渲染)
 *
 * 设计稿 mock 字段 → 真实字段映射全部内置 (g.uniName → group.universityName 等)。
 * className 用 pgv2-*; 在 (teacher) layout 的 .wn-teacher-scope 容器内生效。
 */
import React from 'react';
import UniversityLogo from '@/components/university/UniversityLogo';

// 8 段动态梯度 — 与 page.tsx 的 GRADIENT_LABEL / gradientTone 保持一致
const GRADIENT_LABEL_8: Record<string, string> = {
  JI_CHONG: '极冲', CHONG: '冲', XIAO_CHONG: '小冲',
  WEN: '稳', WEN_BAO: '稳保',
  BAO: '保', QIANG_BAO: '强保', DIBAO: '兜底',
  NO_LINE: '无史线',
};
function tier8(group: any): string {
  // 无任何历史线的组(提前批新设定向组等): calcGradient 兜底值是 BAO,
  // 但"线未知"冒充"保"会误导填报决策 — 标"无史线"交老师人工判断
  if (group?.dynamicGradient && group.dynamicGradient.baseMinRank == null) return 'NO_LINE';
  return group?.dynamicGradient?.tier ?? group?.suggestedGradient ?? 'WEN';
}
function tone8(tier: string): 'rush' | 'stable' | 'safe' | 'accent-soft' {
  if (tier === 'NO_LINE') return 'accent-soft';
  if (['JI_CHONG', 'CHONG', 'XIAO_CHONG'].includes(tier)) return 'rush';
  if (['BAO', 'QIANG_BAO', 'DIBAO'].includes(tier)) return 'safe';
  return 'stable';
}

// 客观纯净度档位 → 颜色 + 文案
const PURITY_META: Record<string, { tone: string; label: string; desc: string }> = {
  S: { tone: 'safe', label: '干净', desc: '专业组高度纯净，几乎无调剂风险' },
  A: { tone: 'accent', label: '较纯', desc: '同门类、主导专业类 ≥70%' },
  B: { tone: 'rush-soft', label: '较乱', desc: '跨 2 门类有主导，需注意调剂' },
  C: { tone: 'rush', label: '混乱', desc: '冷热混装，调剂风险高' },
};

// 把 0~1 score 渲染为「X%」字符串。null/undefined → 空串(由调用方兜底)
function purityPercent(score: number | null | undefined): string {
  if (typeof score !== 'number' || Number.isNaN(score)) return '';
  return `${Math.round(score * 100)}%`;
}

// 2026 vs 2025 专业组变动 chip 元数据。'未变' 不渲染 chip(用户决策, 仅有变动时提示老师对照)。
const CHANGE_META: Record<string, { tone: string; label: string }> = {
  '原组+新增':   { tone: 'safe-soft', label: '原组+新增' },
  '变干净(拆分)': { tone: 'safe',      label: '拆分' },
  '重组(合并)':  { tone: 'rush-soft', label: '重组' },
  '新组无对应':   { tone: 'rush',      label: '新组' },
};

// tooltip: 列出 2025 老组的专业构成(重组组多串各一行,逐顿点呈现)
function changeTitle(group: any): string {
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

function purityTitle(purity: any): string {
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

/** rank gap 文案: 老师心算的就是"差多少位/差多少分", 系统直接给绝对值 */
function rankGapText(
  studentRank?: number,
  adjustedRank?: number | null,
  studentScore?: number,
  groupMinScore?: number | null,
): string {
  if (!studentRank || !adjustedRank) return '位次口径不足';
  const diff = studentRank - adjustedRank;
  // 分差: 学生有效分 vs 组 2025 线(跨年对照, 老师惯用口径)
  const scorePart = studentScore != null && groupMinScore != null
    ? ` · ${studentScore - groupMinScore >= 0 ? '高线' : '低线'} ${Math.abs(studentScore - groupMinScore)} 分`
    : '';
  if (diff > 0) return `落后 ${diff.toLocaleString()} 位${scorePart}`;
  if (diff < 0) return `领先 ${Math.abs(diff).toLocaleString()} 位${scorePart}`;
  return `位次基本匹配${scorePart}`;
}

// ============ 小组件 ============

function MatchRing({ score }: { score?: number | null }) {
  const pct = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const tone = pct >= 90 ? 'safe' : pct >= 75 ? 'accent' : 'rush';
  return (
    <div className={`pgv2-match-ring tone-${tone}`}>
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-dim)" strokeWidth="3.5" />
        <circle
          cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 97.4}, 97.4`}
          transform="rotate(-90 18 18)"
          className="ring-fg"
        />
      </svg>
      <div className="pgv2-match-num">{pct}<span>匹配</span></div>
    </div>
  );
}

/** 位次区间格式化(预测下限~上限), 大数转万 */
function rankBand(lo?: number | null, hi?: number | null): string | null {
  if (lo == null || hi == null) return null;
  const f = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString());
  return lo === hi ? `${f(lo)}` : `${f(lo)}~${f(hi)}`;
}

function PrefDot({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className={`pgv2-pref-dot ${ok ? 'ok' : 'no'}`}>
      <span className="ic">{ok ? '✓' : '✕'}</span>
      {label}
    </span>
  );
}

function Sparkline({ data }: { data?: Array<{ year: number; score: number; rank: number }> }) {
  if (!data || data.length < 2) return null;
  const ranks = data.map((d) => d.rank);
  const min = Math.min(...ranks), max = Math.max(...ranks);
  const norm = (r: number) => (max === min ? 10 : 4 + ((r - min) / (max - min)) * 16);
  const pts = data.map((d, i) => `${4 + i * (72 / (data.length - 1))},${norm(d.rank)}`).join(' ');
  return (
    <svg className="pgv2-spark" viewBox="0 0 80 24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MBar({ k, v, suffix = '', chg, title }: { k: string; v?: string | number | null; suffix?: string; chg?: number | null; title?: string }) {
  // 数据源用 "/" 表示无数据, 视同空值, 否则会显示成裸 "/"
  const isEmpty = v == null || v === '' || String(v).trim() === '/';
  const show = isEmpty ? '—' : `${v}${suffix}`;
  return (
    <div className="pgv2-mbar" title={title}>
      <span className="lbl">{k}</span>
      <span className="val">
        {show}
        {chg != null && chg !== 0 ? (
          <span className={`chg ${chg > 0 ? 'up' : 'down'}`}>{chg > 0 ? '+' : ''}{chg}</span>
        ) : null}
      </span>
    </div>
  );
}

// 距离虚线灰标(够不着 / 偏低 / 无史线) — 仅极端档/无史线显示
const DIST_FLAG: Record<string, { label: string; hint: string }> = {
  reach: { label: '够不着', hint: '该专业组录取门槛位次远好于学生, 差距过大、基本够不着, 仅供参考。老师可自主决策。' },
  toolow: { label: '分数偏低', hint: '学生位次远高于该专业组录取门槛, 报考可能浪费分数。老师可自主决策。' },
  noline: { label: '无史线', hint: '无历史录取线的新设组, 梯度未知, 需人工判断。' },
};
function DistFlag({ distKey }: { distKey: string }) {
  const d = DIST_FLAG[distKey];
  if (!d) return null;
  return <span className={`pgv2-dist-flag ${distKey === 'noline' ? 'noline' : ''}`} title={d.hint}>{d.label}</span>;
}

// 位次刻度尺: 冲 ←— 你的位次 —→ 保, marker 落在组门槛相对学生的位置
function RankRuler({ studentRank, groupMinRank, adjusted, ratio, noLine, gapText }: {
  studentRank?: number; groupMinRank?: number | null; adjusted?: number | null; ratio?: number; noLine?: boolean; gapText?: string;
}) {
  if (noLine || groupMinRank == null) {
    return (
      <div className="pgv2-ruler is-noline">
        <div className="rk-track"><span className="rk-center" style={{ left: '50%' }} /></div>
        <div className="rk-labels"><span className="rk-l">冲</span><span className="rk-you">你 {Number(studentRank || 0).toLocaleString()}</span><span className="rk-r">保</span></div>
        <div className="rk-note muted">无历史录取线, 梯度需人工判断</div>
      </div>
    );
  }
  const basis = adjusted != null ? adjusted : groupMinRank;
  const r = typeof ratio === 'number' ? ratio : (studentRank ? (basis - studentRank) / studentRank : 0);
  const clamped = Math.max(-0.7, Math.min(0.7, r));
  const half = clamped / 0.7 * 50; // -50%(冲) .. +50%(保)
  const markerLeft = 50 + half;
  const ahead = r >= 0;
  const fillStyle = ahead ? { left: '50%', width: half + '%' } : { left: markerLeft + '%', width: -half + '%' };
  return (
    <div className="pgv2-ruler">
      <div className="rk-track">
        <span className="rk-zone rush" /><span className="rk-zone safe" />
        <span className={`rk-fill ${ahead ? 'safe' : 'rush'}`} style={fillStyle} />
        <span className="rk-center" style={{ left: '50%' }} />
        <span className={`rk-marker ${ahead ? 'safe' : 'rush'}`} style={{ left: markerLeft + '%' }} title={`组门槛位次 ${basis.toLocaleString()}`} />
      </div>
      <div className="rk-labels">
        <span className="rk-l">冲</span>
        <span className="rk-you">你 {Number(studentRank || 0).toLocaleString()}</span>
        <span className="rk-r">保</span>
      </div>
      <div className={`rk-note ${ahead ? 'ahead' : 'behind'}`}>
        组门槛 <b>{basis.toLocaleString()}</b> · {gapText || (ahead ? '学生领先' : '学生落后')}
      </div>
    </div>
  );
}

// ============ 主组件 ============

export interface CandidateCardV3Props {
  group: any;
  isExpanded: boolean;
  isHidden: boolean;
  isCompare: boolean;
  isAdded: boolean;
  studentRankForDecision?: number;
  /** 学生有效分(裸分+确认加分), 用于卡片分差直读 */
  studentScoreForDecision?: number;
  /** 组内专业命中学生意向的数量 (父组件按意向集合算好传入); undefined = 学生无意向不显示 */
  preferredHitCount?: number;
  /** 展开后激活的 Tab */
  expandedTab: 'majors' | 'evidence' | 'school';
  onToggleExpand: () => void;
  onToggleCompare: () => void;
  onHide: () => void;
  onRestore: () => void;
  onAdd: () => void;
  onTabChange: (tab: 'majors' | 'evidence' | 'school') => void;
  /** 展开态 Tab 内容(由父组件提供,复用现有真实字段渲染组件) */
  renderExpandedContent: (tab: 'majors' | 'evidence' | 'school') => React.ReactNode;
  /** 用于计算 rankGap 时拿调整后位次的辅助 (父组件提供) */
  adjustedRank?: number | null;
}

export function CandidateCardV3(props: CandidateCardV3Props) {
  const {
    group, isExpanded, isHidden, isCompare, isAdded,
    studentRankForDecision, studentScoreForDecision, preferredHitCount, expandedTab,
    onToggleExpand, onToggleCompare, onHide, onRestore, onAdd, onTabChange,
    renderExpandedContent, adjustedRank,
  } = props;

  const tier = tier8(group);
  const tone = tone8(tier);
  const uniName: string = group?.universityName ?? '—';
  const uni = group?.university ?? {};
  const sections = group?.majorSections ?? { recommended: [], backup: [], risk: [] };
  const sectionTotal = (sections.recommended?.length || 0)
    + (sections.backup?.length || 0)
    + (sections.risk?.length || 0);
  // 组内专业数: 优先 purity.majorCount (后端客观统计), fallback 组 majorCount / 可见 section 合计
  const groupMajorCount = group?.purity?.majorCount ?? group?.majorCount ?? sectionTotal;

  // location: 优先 city, 否则 province
  const location = uni.city || uni.province || '';

  // 趋势数据 (history3y 优先,fallback historyFiling3y)
  const trend = group?.history3y && group.history3y.length >= 2
    ? group.history3y
    : (group?.historyFiling3y && group.historyFiling3y.length >= 2 ? group.historyFiling3y : null);

  // 预测位次置信度文案
  const confidence = group?.predictedMinRank?.confidence;
  const confLabel = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : confidence === 'low' ? '低' : '';
  const confCls = confidence ? `c-${String(confidence).toLowerCase()}` : '';
  // 预测位次区间(乐观~保守): 区间宽窄=预测确定性, 比单点更不易误导
  const predBand = rankBand(group?.predictedMinRank?.optimistic, group?.predictedMinRank?.conservative);
  // 就业/薪资优先取锚定专业级(院校级 employmentRate/avgSalary 常空), 学费=锚定专业 EnrollmentPlan.tuition
  const empRate = group?.anchorEmploymentRate ?? uni.employmentRate;
  const avgSalaryRaw = group?.anchorAvgSalary ?? uni.avgSalary;
  const avgSalary = avgSalaryRaw != null ? `¥${Number(avgSalaryRaw).toLocaleString()}` : null;
  const tuition = group?.anchorTuition;
  const tuitionText = tuition == null ? null : tuition === 0 ? '免费' : tuition.toLocaleString();

  // 灰显区分(不替老师藏): 非意向地区 / 够不着(门槛位次远好于学生) / 分数偏低(学生远高于门槛)。
  // 阈值与院校卡一致(rankGapRatio = 组门槛位次/学生位次 - 1)。
  const regionMismatch = !!group?.regionMismatch;
  const edge = group?.dynamicGradient?.rankGapRatio;
  const reachFar = typeof edge === 'number' && edge < -0.45;
  const tooLow = typeof edge === 'number' && edge > 0.5;
  const mutedReason = regionMismatch ? '非意向地区' : reachFar ? '够不着(门槛远高于学生)' : tooLow ? '分数偏低(可能浪费分)' : '';
  // —— 二维编码: 距离(左色条 dist-*) + 状态(底色 status-*). 距离极端档/无史线 → is-muted 去饱和 ——
  const noLine = group?.dynamicGradient?.baseMinRank == null;
  const distKey = reachFar ? 'reach' : tooLow ? 'toolow' : noLine ? 'noline'
    : tone === 'rush' ? 'chong' : tone === 'safe' ? 'bao' : 'wen';
  const isMuted = reachFar || tooLow || noLine;

  return (
    <article
      className={`pgv2-card ${isExpanded ? 'is-expanded' : ''} ${isHidden ? 'is-hidden' : ''} ${isCompare ? 'is-compare' : ''} dist-${distKey} ${regionMismatch ? 'status-region' : ''} ${isMuted ? 'is-muted' : ''}`}
      title={mutedReason ? `${mutedReason} —— 已灰显区分, 但仍可由老师自主决策加入。` : undefined}
    >
      {/* —— MatchHeader: 匹配环 + 理由 + 4 偏好 dots + 趋势 + 预测 —— */}
      <div className="pgv2-match-header" onClick={onToggleExpand}>
        <MatchRing score={group?.matchScore} />
        <div className="pgv2-match-body">
          <div className="pgv2-match-reason">
            {mutedReason ? <span style={{ color: '#8c8c8c', fontWeight: 600 }}>【{mutedReason}】 </span> : null}
            {group?.matchReason ?? '—'}
          </div>
          <div className="pgv2-pref-row">
            <PrefDot ok={group?.prefMatch?.province === 'match'} label="地域" />
            <PrefDot ok={group?.prefMatch?.tuition === 'within'} label="学费" />
            <PrefDot ok={group?.prefMatch?.career === 'strong'} label="职业" />
            {/* 候选池已按选科过滤(选科恒符), "选科"dot 是噪音, 删除 */}
          </div>
        </div>
        {trend ? (
          <div className="pgv2-trend-mini">
            <Sparkline data={trend} />
            <div className="pgv2-trend-meta">
              <span className="t-range">{trend[0].score} → {trend[trend.length - 1].score}</span>
              {group?.predictedMinRank?.point != null ? (
                <span
                  className="t-pred"
                  title={predBand ? `预测今年录取位次区间 ${predBand}(乐观~保守), 区间越宽预测越不确定` : undefined}
                >
                  ◇ 预测 {predBand ? `${predBand} 位` : `~${group.predictedMinRank.point.toLocaleString()} 位`}
                  {confLabel ? <span className={`t-conf ${confCls}`}>{confLabel}</span> : null}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* —— candidate top: 院校 / 梯度 / 标签 / 选科 + 计划 + 最低 / 操作 —— */}
      <div className="pgv2-card-top" onClick={onToggleExpand}>
        <div className="pgv2-card-l">
          <div className="pgv2-card-name">
            <span className={`pgv2-uni-logo tone-${tone}`}>
              <UniversityLogo name={uniName} logoUrl={uni.logoUrl} size={36} />
            </span>
            <h3>
              {uniName}
              {group?.universityCode ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85em', marginLeft: 8, fontWeight: 400, letterSpacing: '0.5px' }}>
                  {group.universityCode}
                </span>
              ) : null}
            </h3>
            <DistFlag distKey={distKey} />
            {regionMismatch ? <span className="pgv2-status-flag s-region">非意向地区</span> : null}
            {/* 冲稳保标签只在右侧 grade-badge 显示一次, 此处删除重复 */}
            {isAdded ? <span className="pgv2-tag tone-muted">已加入</span> : null}
            {/* 软规则失败分类显示（#3）— 学费/办学性质各自 chip，便于老师判定 */}
            {group?.softFailBreakdown?.tuition > 0 ? (
              <span className="pgv2-tag tone-rush-soft" title="组内有学费超学生预算的专业（调剂可能命中）">
                ¥{group.softFailBreakdown.tuition} 学费超
              </span>
            ) : null}
            {group?.softFailBreakdown?.nature > 0 ? (
              <span className="pgv2-tag tone-rush-soft" title="组内有办学性质不符学生偏好（公办/民办/合作）的专业">
                🏛{group.softFailBreakdown.nature} 办学不符
              </span>
            ) : null}
            {group?.softFailBreakdown?.other > 0 ? (
              <span className="pgv2-tag tone-rush-soft" title="其他软规则不符">
                {group.softFailBreakdown.other} 其他风险
              </span>
            ) : group?.softFailCount > 0 && !group?.softFailBreakdown ? (
              // 后端老接口 fallback
              <span className="pgv2-tag tone-rush-soft">{group.softFailCount} 风险专业</span>
            ) : null}
            {isHidden ? <span className="pgv2-tag tone-muted">已隐藏</span> : null}
          </div>
          {/* —— 位次刻度尺(核心可视化) —— */}
          <RankRuler
            studentRank={studentRankForDecision}
            groupMinRank={group?.groupMinRank}
            adjusted={group?.dynamicGradient?.adjustedMinRank ?? group?.predictedMinRank?.point}
            ratio={typeof edge === 'number' ? edge : undefined}
            noLine={noLine}
          />
          {/* —— 决策要素 chip(纯净度 / 意向命中 / 征集) —— */}
          <div className="pgv2-decision-row">
            {group?.purity?.level && PURITY_META[group.purity.level] ? (
              <span className={`pgv2-dchip tone-${PURITY_META[group.purity.level].tone}`} title={purityTitle(group.purity)}>
                纯净度 {purityPercent(group.purity.score) || PURITY_META[group.purity.level].label}
              </span>
            ) : null}
            {group?.groupChangeType && group.groupChangeType !== '未变' && CHANGE_META[group.groupChangeType] ? (
              <span
                className={`pgv2-dchip tone-${CHANGE_META[group.groupChangeType].tone}`}
                title={changeTitle(group)}
              >
                {CHANGE_META[group.groupChangeType].label}
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
            {group?.supplementary && group.supplementary.totalPlanCount > 0 ? (
              <span
                className="pgv2-dchip tone-safe-soft"
                title={`${group.supplementary.sourceYear} 年本组累计征集 ${group.supplementary.totalPlanCount} 人 / ${group.supplementary.totalRounds ?? 1} 轮。征集=没招满需补录, 常伴随降分, 是可达性的积极信号`}
              >
                征集 {group.supplementary.totalPlanCount}人/{group.supplementary.totalRounds ?? 1}轮
              </span>
            ) : null}
          </div>
          {/* —— 院校级标签 —— */}
          <div className="pgv2-card-tags">
            {uni.is985 ? <span className="pgv2-tag tone-accent">985</span> : null}
            {uni.is211 ? <span className="pgv2-tag tone-accent">211</span> : null}
            {uni.isDoubleFirstClass ? <span className="pgv2-tag tone-accent">双一流</span> : null}
            {uni.firstClassCategory ? <span className="pgv2-tag tone-accent">{uni.firstClassCategory}</span> : null}
            {uni.runningNature ? <span className="pgv2-tag tone-muted">{uni.runningNature}</span> : null}
            {/* 院校背景标签(卓越教师/五院四系等)折叠态不显示, 收进展开态院校详情, 给决策信号让位 */}
            {location ? <span className="pgv2-tag tone-muted">{location}</span> : null}
            {uni.softRanking ? (
              <span
                className="pgv2-tag tone-muted"
                title={String(uni.runningNature ?? '').includes('民办') ? '民办院校按软科民办榜单独排名' : undefined}
              >
                软科{String(uni.runningNature ?? '').includes('民办') ? '民办' : ''} #{uni.softRanking}
              </span>
            ) : null}
            {/* 征集 chip 暂时撤下: 现有 supplementary 是"院校×批次"汇总且混了物理/历史双科类+多轮累加,
                数字虚高(招2人专业被显示成征集100人)。征集数据正用已校验版按"科目+专业组+专业"重建,
                重建后会以"本科类·本组·累计N人/M轮"的正确口径回来。详见 supplementary-data-rebuild 任务 */}
          </div>
          {/* —— 专业组级标签 (与院校级分行) + 组内专业数 —— */}
          <div className="pgv2-card-tags" style={{ marginTop: 2 }}>
            {group?.groupCode || group?.groupName ? (
              <span
                className="pgv2-tag tone-accent"
                style={{ fontSize: '0.95rem', fontWeight: 600, padding: '4px 10px', letterSpacing: '0.2px' }}
              >
                {group?.groupCode ? `[${group.groupCode}] ` : ''}{group?.groupName ?? '专业组'}
                {groupMajorCount ? ` · ${groupMajorCount} 专业` : ''}
              </span>
            ) : null}
            {group?.purity?.level ? (
              <span
                className={`pgv2-tag tone-${PURITY_META[group.purity.level]?.tone ?? 'muted'}`}
                title={purityTitle(group.purity)}
                style={{ fontSize: '0.95rem', fontWeight: 600, padding: '4px 10px' }}
              >
                {purityPercent(group.purity.score) || PURITY_META[group.purity.level]?.label || group.purity.level}
              </span>
            ) : null}
            {/* 征集(本组·学生科类·累计各轮): 没录满=常伴随降分, 边缘/无史线组的可达性积极信号。
                数据已按"科目+专业组"重建, 是这个组本科类自己的征集数(非全校汇总) */}
            {group?.supplementary?.totalPlanCount > 0 ? (
              <span
                className="pgv2-tag tone-safe-soft"
                title={`${group.supplementary.sourceYear ?? ''} 本组${group.supplementary.subject ? '·' + group.supplementary.subject + '类' : ''}累计征集 ${group.supplementary.totalPlanCount} 人 / ${group.supplementary.totalRounds ?? 1} 轮。征集=该组没招满需补录, 常伴随降分; 对位次边缘/无史线组是可达性的积极信号`}
              >
                征集 {group.supplementary.totalPlanCount} 人/{group.supplementary.totalRounds ?? 1} 轮
              </span>
            ) : null}
            {/* 组内意向命中数 = 服从调剂落到非意向专业的风险参考(纯净度管"乱不乱", 这个管"是不是想读的") */}
            {typeof preferredHitCount === 'number' && groupMajorCount ? (
              <span
                className={`pgv2-tag ${preferredHitCount > 0 ? 'tone-safe-soft' : 'tone-rush-soft'}`}
                title={`组内 ${groupMajorCount} 个专业中 ${preferredHitCount} 个命中学生意向。命中越少, 服从调剂落到非意向专业的概率越高`}
              >
                意向 {preferredHitCount}/{groupMajorCount}
              </span>
            ) : null}
          </div>
          <div className="pgv2-card-sub">
            {/* 选科已在组标签/池过滤体现, 折叠态不重复; 此行只留分数信号 */}
            {group?.groupMinScore != null ? (
              <span>历史最低 <strong>{group.groupMinScore}</strong> 分</span>
            ) : null}
            {/* 无史线组的参照锚: 有线组分数带(同校同类型优先, 回退全批次同类型), 老师人工判断的对照基准 */}
            {group?.groupMinScore == null && group?.siblingLineBand ? (
              <span title={`该组无历史录取线; ${group.siblingLineBand.scope === 'BATCH' ? '本批次' : '同校'}同类型(${group?.recruitType ?? '同类'})有 ${group.siblingLineBand.count} 个有线组可作参照`}>
                {group.siblingLineBand.scope === 'BATCH' ? '本批同类组' : '同校同类组'}{' '}
                <strong>
                  {group.siblingLineBand.min === group.siblingLineBand.max
                    ? group.siblingLineBand.min
                    : `${group.siblingLineBand.min}~${group.siblingLineBand.max}`}
                </strong>{' '}
                分 ({group.siblingLineBand.count} 组)
              </span>
            ) : null}
          </div>
        </div>

        <div className="pgv2-card-r">
          <div className={`pgv2-grade-badge tone-${tone}`}>
            <span className="lbl">梯度</span>
            <span className="val">{GRADIENT_LABEL_8[tier] ?? tier}</span>
            <span className="note">{rankGapText(studentRankForDecision, adjustedRank, studentScoreForDecision, group?.groupMinScore)}</span>
          </div>
          <div className="pgv2-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pgv2-action-btn"
              title={isCompare ? '取消对比' : '加入对比'}
              onClick={onToggleCompare}
            >
              ⚖
            </button>
            {isHidden ? (
              <button type="button" className="pgv2-action-btn" title="恢复" onClick={onRestore}>↺</button>
            ) : (
              <button type="button" className="pgv2-action-btn" title="不考虑此校" onClick={onHide}>✕</button>
            )}
            <button
              type="button"
              className={`pgv2-add-btn ${isAdded ? 'added' : ''}`}
              onClick={onAdd}
              disabled={isAdded}
            >
              {isAdded ? '✓ 已加入' : '+ 加入'}
            </button>
          </div>
        </div>
      </div>

      {/* —— MetricStrip ——
           折叠: 高频决策项(最低位次/招生计划/学费/就业率) — 就业率优先专业级、学费=锚定专业
           展开追加: 保研率/升学率/平均薪资/满意度
           注: postgradRate 字段实为「保研率」, furtherStudyRate 实为「升学率」(导入时如此映射) */}
      <div className="pgv2-metric-bar" onClick={onToggleExpand}>
        <MBar k="最低位次" v={group?.groupMinRank != null ? group.groupMinRank.toLocaleString() : null} />
        <MBar k="招生总计划" v={group?.currentPlanCount} suffix=" 人" chg={group?.planCountChange} />
        <MBar k="学费" v={tuitionText} suffix={tuition && tuition > 0 ? ' 元/年' : ''} />
        <MBar k="平均薪资" v={avgSalary} suffix="" />
        {isExpanded ? (
          <>
            <MBar k="就业率" v={empRate} suffix={empRate != null && !String(empRate).includes('%') ? '%' : ''} />
            <MBar k="保研率" v={uni.postgradRate} suffix="" />
            <MBar k="升学率" v={uni.furtherStudyRate} suffix={uni.furtherStudyRate != null && !String(uni.furtherStudyRate).includes('%') ? '%' : ''} />
            <MBar
              k="满意度"
              v={uni.satisfactionOverall}
              suffix={uni.satisfactionCount ? ` / ${uni.satisfactionCount} 人` : ''}
            />
          </>
        ) : null}
      </div>

      {/* —— 展开态: 3 Tab 框架 + 由父组件提供内容 —— */}
      {isExpanded ? (
        <div className="pgv2-card-body">
          <div className="pgv2-card-tabs">
            {(
              [
                { k: 'majors' as const, label: '专业列表', n: sectionTotal },
                { k: 'evidence' as const, label: '数据依据', n: null },
                { k: 'school' as const, label: '院校详情', n: null },
              ]
            ).map((t) => (
              <button
                type="button"
                key={t.k}
                className={`pgv2-card-tab ${expandedTab === t.k ? 'is-active' : ''}`}
                onClick={() => onTabChange(t.k)}
              >
                {t.label}
                {t.n != null ? <span className="n">{t.n}</span> : null}
              </button>
            ))}
          </div>

          <div className="pgv2-card-tab-content">
            {renderExpandedContent(expandedTab)}
          </div>
        </div>
      ) : null}
    </article>
  );
}
