/**
 * 候选卡 v3 — 逐行照抄设计稿 plan-generate.jsx 940-1135 的 pgv2-card(专业优先 MAJOR 卡)结构:
 *   - pgv2-card-top → pgv2-card-l:
 *       pgv2-card-name (logo + 校名 + 招生代码 + 梯度 tier-tag + flags)
 *       pgv3-tier-school (「院校」tag + 院校属性 tags)
 *       pgv3-tier-group (「专业组」tag + tier-body[tb-main: 组身份/位次尺/分数行 + tb-signals: 决策 dchip]
 *                        + pgv3-group-actions[iconcol 对比/移除 + cta 加入])
 *   - 展开态 pgv2-card-body: pgv2-match-header (匹配环+理由+偏好+趋势) + pgv2-metric-bar (6 项)
 *       + 专业级内容 (renderExpandedContent — 含 P.XX 页码 / 4 年历史 / 征集 byYear, 由父组件提供)
 *
 * 设计稿 mock 字段 → 真实字段映射全部内置 (g.uniName → group.universityName 等)。
 * className 用 pgv2-* / pgv3-*; 在 (teacher) layout 的 .wn-teacher-scope 容器内生效。
 */
import React from 'react';
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  RollbackOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import UniversityLogo from '@/components/university/UniversityLogo';
import { GroupSignalChips } from './candidate-group-signals';

// 8 段动态梯度 — 与 page.tsx 的 GRADIENT_LABEL / gradientTone 保持一致
// 无史线状态(NO_LINE)不进 grade-badge 显示, 信号统一交给 RankRuler is-noline + 展开 banner;
// 见下方 noLine 处理。
const GRADIENT_LABEL_8: Record<string, string> = {
  JI_CHONG: '够不着', CHONG: '冲', XIAO_CHONG: '小冲',
  WEN: '稳', WEN_BAO: '稳保',
  BAO: '保', QIANG_BAO: '强保', DIBAO: '兜底',
};
function tier8(group: any): string {
  // 无任何历史线的组(提前批新设定向组等): calcGradient 兜底值是 BAO,
  // 但"线未知"冒充"保"会误导填报决策 — 标"无史线"交老师人工判断
  if (group?.dynamicGradient && group.dynamicGradient.baseMinRank == null) return 'NO_LINE';
  return group?.dynamicGradient?.tier ?? group?.suggestedGradient ?? 'WEN';
}
function tone8(tier: string): 'rush' | 'stable' | 'safe' {
  if (['JI_CHONG', 'CHONG', 'XIAO_CHONG'].includes(tier)) return 'rush';
  if (['BAO', 'QIANG_BAO', 'DIBAO'].includes(tier)) return 'safe';
  return 'stable';
}

// 纯净度 / 组变动 / 招生 vs 2025 等组级信号 chip 已抽到 ./candidate-group-signals,
// 与院校优先视图共用, 保证两模式口径一致(见 GroupSignalChips)。

// ============ 小组件 ============

export function MatchRing({ score }: { score?: number | null }) {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const pct = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0;
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
      <div className="pgv2-match-num">{hasScore ? pct : '—'}<span>匹配</span></div>
    </div>
  );
}

/** 位次区间格式化(预测下限~上限), 大数转万 */
function rankBand(lo?: number | null, hi?: number | null): string | null {
  if (lo == null || hi == null) return null;
  const f = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString());
  return lo === hi ? `${f(lo)}` : `${f(lo)}~${f(hi)}`;
}

export function PrefDot({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <span className={`pgv2-pref-dot ${ok ? 'ok' : 'no'}`}>
      <span className="ic">{ok ? '✓' : '✕'}</span>
      {label}
    </span>
  );
}

export function Sparkline({ data }: { data?: Array<{ year: number; score: number; rank: number }> }) {
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

// 设计稿 MBar: 标签(mb-k) + 值(mb-v, 后缀走 <i>) + 可选环比(mb-chg) + 可选进度条(mb-track/mb-fill)。
// pct = 进度条填充百分比(0~100); 无数据时不渲染进度条。
export function MBar({ k, v, suffix = '', chg, pct, title }: { k: string; v?: string | number | null; suffix?: string; chg?: number | null; pct?: number | null; title?: string }) {
  // 数据源用 "/" 表示无数据, 视同空值, 否则会显示成裸 "/"
  const isEmpty = v == null || v === '' || String(v).trim() === '/';
  return (
    <div className="pgv2-mbar" title={title}>
      <span className="mb-k">{k}</span>
      <span className="mb-v">
        {isEmpty ? '—' : v}
        {!isEmpty && suffix ? <i>{suffix}</i> : null}
        {chg != null && chg !== 0 ? (
          <span className={`mb-chg ${chg > 0 ? 'up' : 'down'}`}>{chg > 0 ? '+' : ''}{chg}</span>
        ) : null}
      </span>
      {pct != null ? (
        <span className="mb-track">
          <span className="mb-fill" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
        </span>
      ) : null}
    </div>
  );
}

// 把可能带 '%'/'¥'/逗号的字符串/数字字段解析为纯数字, 供 MBar 值与进度条 pct 用。无法解析 → null(不渲染条)
function ratePct(v?: number | string | null): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// 距离虚线灰标(分数偏低) — 仅极端档显示;
// "够不着"已并入档位徽章(JI_CHONG → 够不着), 不再单出 reach 灰标避免重复; dist-reach 仅保留 CSS 灰色条。
// 无史线信号不进 dist-flag, 由 RankRuler is-noline + 展开 banner 单独承担, 避免在 4 处重复。
const DIST_FLAG: Record<string, { label: string; hint: string }> = {
  toolow: { label: '分数偏低', hint: '学生位次远高于该专业组录取门槛, 报考可能浪费分数。老师可自主决策。' },
};
function DistFlag({ distKey }: { distKey: string }) {
  const d = DIST_FLAG[distKey];
  if (!d) return null;
  return <span className="pgv2-dist-flag" title={d.hint}>{d.label}</span>;
}

// 位次刻度尺: 冲 ←— 你的位次 —→ 保, marker 落在组门槛相对学生的位置
export function RankRuler({ studentRank, groupMinRank, adjusted, ratio, noLine, gapText }: {
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
  onRemove: () => void; // 已加入态再点 → 取消加入(移出方案)
  onTabChange: (tab: 'majors' | 'evidence' | 'school') => void;
  /** 展开态 Tab 内容(由父组件提供,复用现有真实字段渲染组件) */
  renderExpandedContent: (tab: 'majors' | 'evidence' | 'school') => React.ReactNode;
  /** 用于计算 rankGap 时拿调整后位次的辅助 (父组件提供) */
  adjustedRank?: number | null;
  /** 详情页等复用场景可替换右侧操作区; 不传则保持候选池默认按钮。 */
  actionSlot?: React.ReactNode;
  /** 详情页快照数据没有完整匹配/就业指标时可关闭展开头部指标。默认保持候选池展示。 */
  showExpandedOverview?: boolean;
}

export function CandidateCardV3(props: CandidateCardV3Props) {
  const {
    group, isExpanded, isHidden, isCompare, isAdded,
    studentRankForDecision, preferredHitCount, expandedTab,
    onToggleExpand, onToggleCompare, onHide, onRestore, onAdd, onRemove,
    renderExpandedContent,
    actionSlot,
    showExpandedOverview = true,
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

  // location: 省份-城市(如 安徽-淮南); 省市同名(直辖市)只显一次; 缺一显另一个
  const location = uni.province && uni.city && uni.province !== uni.city
    ? `${uni.province}-${uni.city}`
    : (uni.province || uni.city || '');

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
  // —— 指标条带(设计稿 6 项 MBar, 带进度条)——
  // 就业/薪资优先取锚定专业级(院校级 employmentRate/avgSalary 常空)
  const empRate = group?.anchorEmploymentRate ?? uni.employmentRate;
  const empPct = ratePct(empRate);
  // 注: postgradRate 字段实为「保研率」, 但设计稿条带标「考研率」; furtherStudyRate 实为「升学率」标「深造率」 — 沿用设计稿标签
  const postgradPct = ratePct(uni.postgradRate);
  const furtherPct = ratePct(uni.furtherStudyRate);
  // 平均薪资: 设计稿以「k」展示(/1000), 进度条 pct = min(100, 薪资/200)(¥20000 封顶)
  const avgSalaryRaw = group?.anchorAvgSalary ?? uni.avgSalary;
  const avgSalaryNum = ratePct(avgSalaryRaw); // 复用解析(去 ¥/逗号外的纯数字场景); 失败 → null
  const avgSalaryK = avgSalaryNum != null ? (avgSalaryNum / 1000).toFixed(1) : null;
  const avgSalaryPct = avgSalaryNum != null ? Math.min(100, avgSalaryNum / 200) : null;
  // 满意度: 5 分制 → 进度条 pct = 分/5*100
  const satOverall = uni.satisfactionOverall;
  const satPct = typeof satOverall === 'number' && satOverall > 0 ? (satOverall / 5) * 100 : null;

  // 灰显区分(不替老师藏): 非意向地区 / 够不着(门槛位次远好于学生) / 分数偏低(学生远高于门槛)。
  // 阈值与院校卡一致(rankGapRatio = 组门槛位次/学生位次 - 1)。
  const regionMismatch = !!group?.regionMismatch;
  const edge = group?.dynamicGradient?.rankGapRatio;
  // "够不着"与极冲线重合: tier===JI_CHONG 即 edge<老师的极冲阈值(jiChong), 自动跟随自定义阈值,
  // 不再用写死的 -0.45(那会让 -0.15~-0.45 这段几乎没戏的组仍标成可推荐的"极冲")。
  const reachFar = tier === 'JI_CHONG';
  const tooLow = typeof edge === 'number' && edge > 0.5;
  const mutedReason = regionMismatch ? '非意向地区' : reachFar ? '够不着(门槛远高于学生)' : tooLow ? '分数偏低(可能浪费分)' : '';
  // —— 二维编码: 距离(左色条 dist-*) + 状态(底色 status-*). 距离极端档/无史线 → is-muted 去饱和 ——
  // 无史线 → distKey='noline' 走 CSS 中性 accent 色条, 但 DistFlag 字典无 noline 条目即不渲染文案,
  // 避免色条退化成绿色误导老师把无史线读成"稳"档。
  const noLine = group?.dynamicGradient?.baseMinRank == null;
  const distKey = reachFar ? 'reach' : tooLow ? 'toolow' : noLine ? 'noline'
    : tone === 'rush' ? 'chong' : tone === 'safe' ? 'bao' : 'wen';
  const isMuted = reachFar || tooLow || noLine;

  // 组内专业数 · 招生类别(设计稿 gid-meta)。recruitType 走后端真实字段。
  const recruitType: string = group?.recruitType?.trim?.() || '普通类';

  return (
    // 逐行照抄设计稿 plan-generate.jsx 940-1135 的 pgv2-card(专业优先 MAJOR 卡)DOM 树。
    // mock g.xxx → 真实 group.xxx; TIcon.x → @ant-design/icons; window 组件 → 现有 props。
    <article
      className={`pgv2-card ${isExpanded ? 'is-expanded' : ''} ${isCompare ? 'is-compare' : ''} dist-${distKey} ${regionMismatch ? 'status-region' : ''} ${isMuted ? 'is-muted' : ''} ${isHidden ? 'is-hidden' : ''}`}
      title={mutedReason ? `${mutedReason} —— 已灰显区分, 但仍可由老师自主决策加入。` : undefined}
    >
      <div className="pgv2-card-top" onClick={onToggleExpand}>
        <div className="pgv2-card-l">
          <div className="pgv2-card-name">
            <span className={`pgv2-uni-logo tone-${tone}`}>
              <UniversityLogo name={uniName} logoUrl={uni.logoUrl} size={28} />
            </span>
            <h3>{uniName}{group?.universityCode ? <span className="pgv3-unicode">招生代码 {group.universityCode}</span> : null}</h3>
            {!noLine
              ? <span className={`pgv2-tier-tag tone-${tone}`}>{GRADIENT_LABEL_8[tier] ?? tier}</span>
              : null}
            <DistFlag distKey={distKey} />
            {regionMismatch ? <span className="pgv2-status-flag s-region">非意向地区</span> : null}
            {isAdded && <span className="pgv2-tag tone-muted">已加入</span>}
            {isHidden && <span className="pgv2-tag tone-muted">已隐藏</span>}
          </div>

          {/* 院校层级 —— 学校身份属性 */}
          <div className="pgv3-tier pgv3-tier-school">
            <span className="tier-tag">院校</span>
            <div className="pgv2-card-tags">
              {uni.is985 ? <span className="pgv2-tag tone-neutral">985</span> : null}
              {uni.is211 ? <span className="pgv2-tag tone-neutral">211</span> : null}
              {uni.isDoubleFirstClass ? <span className="pgv2-tag tone-neutral">双一流</span> : null}
              {uni.firstClassCategory ? <span className="pgv2-tag tone-neutral">{uni.firstClassCategory}</span> : null}
              <span className="pgv2-tag tone-neutral">{uni.runningNature || '公办'}</span>
              {location ? <span className="pgv2-tag tone-neutral">{location}</span> : null}
              {uni.softRanking ? (
                <span
                  className="pgv2-tag tone-neutral"
                  title={String(uni.runningNature ?? '').includes('民办') ? '民办院校按软科民办榜单独排名' : undefined}
                >
                  软科{String(uni.runningNature ?? '').includes('民办') ? '民办' : ''} #{uni.softRanking}
                </span>
              ) : null}
            </div>
          </div>

          {/* 专业组层级 —— 本组身份 + 录取位置 + 决策信号 */}
          <div className="pgv3-tier pgv3-tier-group">
            <span className="tier-tag">专业组</span>
            <div className="tier-body">
              <div className="tb-main">
                <div className="pgv3-group-id">
                  {group?.groupCode ? <span className="gid-code">[{group.groupCode}]</span> : null}
                  <span className="gid-name">{group?.groupName ?? '专业组'}</span>
                  <span className="gid-meta">{groupMajorCount}专业 · {recruitType}</span>
                </div>

                {/* 位次刻度尺 —— 核心可视化 */}
                <RankRuler
                  studentRank={studentRankForDecision}
                  groupMinRank={group?.groupMinRank}
                  adjusted={group?.dynamicGradient?.adjustedMinRank ?? group?.predictedMinRank?.point}
                  ratio={typeof edge === 'number' ? edge : undefined}
                  noLine={noLine}
                />

                <div className="pgv2-card-sub">
                  {group?.subjects && <span>选科 {group.subjects}</span>}
                  {group?.subjects && (group?.groupMinScore != null || group?.siblingLineBand) ? <span className="dot" /> : null}
                  {group?.groupMinScore != null && group?.groupMinRank != null ? (
                    <span>历史最低 <strong>{group.groupMinScore}</strong> 分 / 位次 <strong>{group.groupMinRank.toLocaleString()}</strong></span>
                  ) : group?.siblingLineBand ? (
                    <span title={`本组无历史录取线; ${group.siblingLineBand.scope === 'BATCH' ? '本批次' : '同校'}同类型有 ${group.siblingLineBand.count} 个有线组可作参照`}>
                      {group.siblingLineBand.scope === 'BATCH' ? '本批同类组' : '同校同类组'}{' '}
                      <strong>
                        {group.siblingLineBand.min === group.siblingLineBand.max
                          ? group.siblingLineBand.min
                          : `${group.siblingLineBand.min}~${group.siblingLineBand.max}`}
                      </strong>{' '}
                      分（{group.siblingLineBand.count} 组参照）
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>无历史录取线</span>
                  )}
                </div>

                {/* 转专业政策(院校级): transfer_difficulty 优先→charter 回退, 有才显示; 单行截断, 悬停看全文 */}
                {uni.transferPolicy ? (
                  <div className="pgv3-transfer" title={uni.transferPolicy}>
                    <span className="t-label">转专业</span>
                    <span className="t-text">{uni.transferPolicy}</span>
                  </div>
                ) : null}
              </div>

              {/* 决策要素(高权重·彩色)—— 与院校优先视图共用 GroupSignalChips, 口径一致 */}
              <div className="pgv2-decision-row tb-signals">
                <GroupSignalChips group={group} preferredHitCount={preferredHitCount} />
              </div>
            </div>

            {/* 操作:对比 / 移除 + 加入 —— 在专业组层级内垂直居中 */}
            <div className="pgv3-group-actions" onClick={(e) => e.stopPropagation()}>
              {actionSlot !== undefined ? (
                actionSlot
              ) : (
                <>
                  <div className="pgv2-card-iconcol">
                    <button
                      type="button"
                      className="pgv2-action-btn"
                      title={isCompare ? '取消对比' : '加入对比'}
                      onClick={onToggleCompare}
                    >
                      {isCompare ? <span style={{ width: 12, height: 12, display: 'inline-flex' }}><CheckOutlined /></span> : '⚖'}
                    </button>
                    {isHidden ? (
                      <button type="button" className="pgv2-action-btn" title="恢复" onClick={onRestore}>
                        <span style={{ width: 12, height: 12, display: 'inline-flex' }}><RollbackOutlined /></span>
                      </button>
                    ) : (
                      <button type="button" className="pgv2-action-btn" title="不考虑此校" onClick={onHide}>
                        <span style={{ width: 12, height: 12, display: 'inline-flex' }}><CloseOutlined /></span>
                      </button>
                    )}
                  </div>
                  <div className="pgv2-card-cta">
                    {isAdded ? (
                      <button
                        type="button"
                        className="pgv2-add-btn tall added"
                        onClick={onRemove}
                        title="已加入方案 · 再次点击取消加入"
                      >
                        <span className="ic"><CheckOutlined /></span><span>已加入</span>
                      </button>
                    ) : (
                      <button type="button" className="pgv2-add-btn tall" onClick={onAdd}>
                        <span className="ic"><PlusOutlined /></span><span>加入方案</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* —— 状态说明条 —— */}
      {regionMismatch ? (
        <div className="pgv2-hard-note"><WarningOutlined /><span>该院校所在地({location || '—'})不在学生意向地区, 整卡已去饱和区分 —— 仍可由老师自主决策加入。</span></div>
      ) : null}

      {/* 展开区: MatchHeader + 就业指标(6 项) + 专业级信息(由父组件提供) */}
      {isExpanded ? (
        <div className="pgv2-card-body">
          {showExpandedOverview ? (
            <>
              {/* —— 匹配分环 + 理由 + 偏好 + 趋势 —— */}
              <div className="pgv2-match-header">
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
                ) : (
                  <div className="pgv2-trend-mini">
                    <div className="pgv2-trend-meta" style={{ textAlign: 'right' }}>
                      <span className="t-range" style={{ color: 'var(--text-muted)' }}>无历史录取线</span>
                      <span className="t-pred" style={{ color: 'var(--text-muted)' }}>需人工判断</span>
                    </div>
                  </div>
                )}
              </div>

              {/* —— 就业 6 项(带进度条)——
                   注: postgradRate 字段实为「保研率」, furtherStudyRate 实为「升学率」(导入时如此映射), 此处沿用设计稿标签 */}
              <div className="pgv2-metric-bar">
                <MBar k="招生" v={group?.currentPlanCount} suffix="人" chg={group?.planCountChange} />
                <MBar k="考研率" v={postgradPct} suffix="%" pct={postgradPct} />
                <MBar k="深造率" v={furtherPct} suffix="%" pct={furtherPct} />
                <MBar k="就业率" v={empPct} suffix="%" pct={empPct} />
                <MBar k="平均薪资" v={avgSalaryK} suffix="k" pct={avgSalaryPct} />
                <MBar k="满意度" v={satOverall} suffix={uni.satisfactionCount ? `/5 · ${uni.satisfactionCount}人` : '/5'} pct={satPct} />
              </div>
            </>
          ) : null}

          {/* —— 专业级信息(展开态专业列表, 含 P.XX 页码 / 4 年历史 / 征集 byYear)—— */}
          <div className="pgv2-card-tab-content">
            {renderExpandedContent(expandedTab)}
          </div>
        </div>
      ) : null}
    </article>
  );
}
