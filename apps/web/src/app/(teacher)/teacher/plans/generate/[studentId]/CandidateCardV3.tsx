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

function purityTitle(purity: any): string {
  if (!purity) return '';
  const m = PURITY_META[purity.level] ?? { desc: '' };
  const parts: string[] = [m.desc];
  if (purity.majorCount) parts.push(`组内 ${purity.majorCount} 个专业`);
  if (purity.dominantDiscipline) {
    const pct = Math.round((purity.dominantDisciplineRatio ?? 0) * 100);
    parts.push(`主导 ${purity.dominantDiscipline} ${pct}%`);
  }
  if (purity.crossCategoryCount > 1) parts.push(`跨 ${purity.crossCategoryCount} 门类`);
  if (purity.mixedForeign) parts.push('混入中外合作');
  if (Array.isArray(purity.reasons) && purity.reasons[0]) parts.push(purity.reasons[0]);
  return parts.join(' · ');
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

function MBar({ k, v, suffix = '', chg }: { k: string; v?: string | number | null; suffix?: string; chg?: number | null }) {
  // 数据源用 "/" 表示无数据, 视同空值, 否则会显示成裸 "/"
  const isEmpty = v == null || v === '' || String(v).trim() === '/';
  const show = isEmpty ? '—' : `${v}${suffix}`;
  return (
    <div className="pgv2-mbar">
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

  // 院校背景标签 (卓越教师/C9联盟/五院四系/部委直属等), 数据源 '/' 分隔; 最多取 4 个防刷屏
  // 剔除与 985/211/双一流/一流学科 badge 重复的词, 避免冗余
  const bgTags = String(uni.universityBackground ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t) => !['985', '211', '双一流', '一流学科', '一流大学'].some((x) => t.includes(x)))
    .slice(0, 4);

  // 趋势数据 (history3y 优先,fallback historyFiling3y)
  const trend = group?.history3y && group.history3y.length >= 2
    ? group.history3y
    : (group?.historyFiling3y && group.historyFiling3y.length >= 2 ? group.historyFiling3y : null);

  // 预测位次置信度文案
  const confidence = group?.predictedMinRank?.confidence;
  const confLabel = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : confidence === 'low' ? '低' : '';
  const confCls = confidence ? `c-${String(confidence).toLowerCase()}` : '';

  return (
    <article
      className={`pgv2-card ${isExpanded ? 'is-expanded' : ''} ${isHidden ? 'is-hidden' : ''} ${isCompare ? 'is-compare' : ''} tier-${tone}`}
    >
      {/* —— MatchHeader: 匹配环 + 理由 + 4 偏好 dots + 趋势 + 预测 —— */}
      <div className="pgv2-match-header" onClick={onToggleExpand}>
        <MatchRing score={group?.matchScore} />
        <div className="pgv2-match-body">
          <div className="pgv2-match-reason">{group?.matchReason ?? '—'}</div>
          <div className="pgv2-pref-row">
            <PrefDot ok={group?.prefMatch?.province === 'match'} label="地域" />
            <PrefDot ok={group?.prefMatch?.tuition === 'within'} label="学费" />
            <PrefDot ok={group?.prefMatch?.career === 'strong'} label="职业" />
            <PrefDot ok={group?.prefMatch?.subjects === 'match'} label="选科" />
          </div>
        </div>
        {trend ? (
          <div className="pgv2-trend-mini">
            <Sparkline data={trend} />
            <div className="pgv2-trend-meta">
              <span className="t-range">{trend[0].score} → {trend[trend.length - 1].score}</span>
              {group?.predictedMinRank?.point != null ? (
                <span className="t-pred">
                  ◇ 预测 ~{group.predictedMinRank.point.toLocaleString()} 位
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
            <span className={`pgv2-tier-tag tone-${tone}`}>{GRADIENT_LABEL_8[tier] ?? tier}</span>
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
          {/* —— 院校级标签 —— */}
          <div className="pgv2-card-tags">
            {uni.is985 ? <span className="pgv2-tag tone-accent">985</span> : null}
            {uni.is211 ? <span className="pgv2-tag tone-accent">211</span> : null}
            {uni.isDoubleFirstClass ? <span className="pgv2-tag tone-accent">双一流</span> : null}
            {uni.firstClassCategory ? <span className="pgv2-tag tone-accent">{uni.firstClassCategory}</span> : null}
            {uni.runningNature ? <span className="pgv2-tag tone-muted">{uni.runningNature}</span> : null}
            {/* 院校背景标签 (卓越教师/C9联盟/五院四系等); '/' 分隔, 最多显示 4 个 */}
            {bgTags.map((t) => (
              <span key={t} className="pgv2-tag tone-accent-soft" title={uni.universityBackground ?? undefined}>{t}</span>
            ))}
            {location ? <span className="pgv2-tag tone-muted">{location}</span> : null}
            {uni.softRanking ? (
              <span
                className="pgv2-tag tone-muted"
                title={String(uni.runningNature ?? '').includes('民办') ? '民办院校按软科民办榜单独排名' : undefined}
              >
                软科{String(uni.runningNature ?? '').includes('民办') ? '民办' : ''} #{uni.softRanking}
              </span>
            ) : null}
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
                {PURITY_META[group.purity.level]?.label ?? group.purity.level}
              </span>
            ) : null}
            {/* 征集历史 = 可达性的最强信号(征集常伴随降分), 从 evidence tab 提到卡面 */}
            {group?.supplementary?.totalPlanCount > 0 ? (
              <span
                className="pgv2-tag tone-safe-soft"
                title={`去年本校本批次征集 ${group.supplementary.totalRounds ?? 1} 轮共 ${group.supplementary.totalPlanCount} 人${group.supplementary.supplementaryRate ? ` · 征集率 ${group.supplementary.supplementaryRate}%` : ''}。征集常伴随降分, 对位次边缘/无史线组是可达性的积极信号`}
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
            {group?.subjects ? <span>选科 {group.subjects}</span> : null}
            {/* 历史最低位次已在下方指标条显示, 这里只留分数避免重复 */}
            {group?.subjects && group?.groupMinScore != null ? <span className="dot" /> : null}
            {group?.groupMinScore != null ? (
              <span>历史最低 <strong>{group.groupMinScore}</strong> 分</span>
            ) : null}
            {/* 无史线组的参照锚: 有线组分数带(同校同类型优先, 回退全批次同类型), 老师人工判断的对照基准 */}
            {group?.groupMinScore == null && group?.siblingLineBand ? (
              <>
                {group?.subjects ? <span className="dot" /> : null}
                <span title={`该组无历史录取线; ${group.siblingLineBand.scope === 'BATCH' ? '本批次' : '同校'}同类型(${group?.recruitType ?? '同类'})有 ${group.siblingLineBand.count} 个有线组可作参照`}>
                  {group.siblingLineBand.scope === 'BATCH' ? '本批同类组' : '同校同类组'}{' '}
                  <strong>
                    {group.siblingLineBand.min === group.siblingLineBand.max
                      ? group.siblingLineBand.min
                      : `${group.siblingLineBand.min}~${group.siblingLineBand.max}`}
                  </strong>{' '}
                  分 ({group.siblingLineBand.count} 组)
                </span>
              </>
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
           折叠: 组级决策(最低位次/招生总计划) + 升学(保研率/升学率)
           展开追加: 就业类(就业率/平均薪资/满意度)
           注: postgradRate 字段实为「保研率」数据, furtherStudyRate 实为「升学率」(导入时如此映射) */}
      <div className="pgv2-metric-bar" onClick={onToggleExpand}>
        <MBar k="最低位次" v={group?.groupMinRank != null ? group.groupMinRank.toLocaleString() : null} />
        <MBar k="招生总计划" v={group?.currentPlanCount} suffix=" 人" chg={group?.planCountChange} />
        <MBar k="保研率" v={uni.postgradRate} suffix="" />
        <MBar k="升学率" v={uni.furtherStudyRate} suffix={uni.furtherStudyRate != null && !String(uni.furtherStudyRate).includes('%') ? '%' : ''} />
        {isExpanded ? (
          <>
            <MBar k="就业率" v={uni.employmentRate} suffix="" />
            <MBar k="平均薪资" v={uni.avgSalary} suffix="" />
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
