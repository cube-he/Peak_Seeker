'use client';

/**
 * 院校优先视图的院校卡 (WillNest pgv3 复刻)。
 * 头部 pgv3-uni-head: logo / 名称 / 代码 / 意向金标 / 层次标签 / 软科 / 冲稳保摘要
 * 体部 pgv3-grow 行: 距离色条(gbar) + 组码/选科 + 梯度/纯净度 + 末位位次差 + 招生 + 代表专业 + 详情/加入
 * 二维编码: 距离(gbar 左色条 + 够不着/偏低灰显) + 状态(软不符暖色 / 全员资格不符锁定不可填)。
 *
 * 加入: 子行「加入」→ onAddGroup(group), 走现有 addCandidateGroup 流程, 产物与专业优先一致。
 * 详情: 「详情」→ 卡内内联展开(匹配环 + 偏好 + 趋势 + 就业指标 + 专业行), 复用候选卡组件, 不再开 Drawer。
 */

import { useState } from 'react';
import { MatchRing, MBar, PrefDot, Sparkline } from './CandidateCardV3';
import CandidateMajorSection from './candidate-major-section';

const GRAD_LABEL: Record<string, string> = { CHONG: '冲', WEN: '稳', BAO: '保' };
const GRAD_TONE: Record<string, string> = { CHONG: 'rush', WEN: 'stable', BAO: 'safe' };
const PURITY_TONE: Record<string, { tone: string; label: string; desc: string }> = {
  S: { tone: 'safe', label: '干净', desc: '专业组高度纯净, 几乎无调剂风险' },
  A: { tone: 'safe-soft', label: '较纯', desc: '同门类、主导专业类 ≥70%' },
  B: { tone: 'accent', label: '较乱', desc: '跨 2 门类有主导, 需注意调剂' },
  C: { tone: 'rush', label: '混乱', desc: '冷热混装, 调剂风险高' },
};

interface Props {
  university: any; // CandidateUniversity (后端 rollup 结构)
  studentRank?: number | null; // 学生位次, 用于显示组末位差距
  isGroupAdded: (group: any) => boolean;
  onAddGroup: (group: any) => void;
}

const fmt = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—');

// rate 字段是字符串, 部分已自带 '%'(如 '96.4%')。已带则不再补, 避免 '12%%'。
const pctSuffix = (v: unknown) => (v != null && v !== '' && !String(v).includes('%') ? '%' : '');

// 学生位次 vs 组末位的差距 (末位数字越大=越容易进)
function gapText(studentRank: number | null | undefined, minRank: unknown): { txt: string; ahead: boolean } | null {
  if (typeof studentRank !== 'number' || typeof minRank !== 'number') return null;
  const diff = minRank - studentRank; // 正 = 学生领先(更稳)
  const k = Math.abs(diff) >= 10000 ? `${(Math.abs(diff) / 10000).toFixed(1)}万` : `${(Math.abs(diff) / 1000).toFixed(1)}k`;
  if (diff > 0) return { txt: `领先 ${k}`, ahead: true };
  if (diff < 0) return { txt: `落后 ${k}`, ahead: false };
  return { txt: '持平', ahead: true };
}

export default function UniversityCandidateCard({
  university,
  studentRank,
  isGroupAdded,
  onAddGroup,
}: Props) {
  // 卡内内联展开: 同时只展开一个专业组 (点同组再次切换收起), 复刻候选卡(专业优先)的展开交互
  const [openKey, setOpenKey] = useState<string | null>(null);
  const u = university.university ?? {};
  const s = university.summary ?? {};
  const spread = s.gradientSpread ?? { chong: 0, wen: 0, bao: 0 };
  const groups: any[] = Array.isArray(university.groups) ? university.groups : [];
  // 民办: 软科榜按办学性质分别排名, 民办的 softRanking 是民办分类排名, 需标注区分
  const isPrivate = String(u.runningNature ?? '').includes('民办');
  // 非意向地区(院校级属性, 同校所有组一致): is-region 灰显区分 —— 不替老师藏, 视觉降级, 老师自主决策。
  const regionMismatch = groups.some((g: any) => g?.regionMismatch);
  // 院校背景标签 (卓越教师/C9联盟等), '/' 分隔, 去掉与层次重复的, 最多 4 个
  const bg = String(u.universityBackground ?? '')
    .split('/')
    .map((t: string) => t.trim())
    .filter(Boolean)
    .filter((t: string) => !['985', '211', '双一流', '一流学科', '一流大学'].some((x) => t.includes(x)))
    .slice(0, 4);

  return (
    <div className={`pgv3-uni-card ${regionMismatch ? 'is-region' : ''}`}>
      {/* —— 头部 —— */}
      <div className={`pgv3-uni-head ${s.isPreferred ? 'preferred' : 'plain'}`}>
        <div className="pgv3-uni-title">
          <span
            className={`pgv2-uni-logo tone-${s.isPreferred ? 'accent' : 'stable'}`}
            style={{ width: 32, height: 32, fontSize: 15 }}
          >
            {String(university.universityName ?? '—')[0]}
          </span>
          <h3>{university.universityName}</h3>
          {university.universityCode ? <span className="code">{university.universityCode}</span> : null}
          {s.isPreferred ? (
            <span className="pgv3-uni-gold">★ 意向院校{s.preferredRank ? ` #${s.preferredRank}` : ''}</span>
          ) : null}
          {regionMismatch ? <span className="pgv2-status-flag s-region">非意向地区</span> : null}
        </div>
        <div className="pgv3-uni-tags">
          {u.is985 ? <span className="pgv2-tag tone-accent">985</span> : null}
          {u.is211 ? <span className="pgv2-tag tone-accent">211</span> : null}
          {u.isDoubleFirstClass ? <span className="pgv2-tag tone-accent">双一流</span> : null}
          {u.firstClassCategory ? <span className="pgv2-tag tone-accent">{u.firstClassCategory}</span> : null}
          {bg.map((t: string) => (
            <span key={t} className="pgv2-tag tone-muted" title={u.universityBackground}>{t}</span>
          ))}
          {u.runningNature ? (
            <span className={`pgv2-tag ${isPrivate ? 'tone-rush-soft' : 'tone-muted'}`}>{u.runningNature}</span>
          ) : null}
          {(u.province || u.city) ? (
            <span className="pgv2-tag tone-muted">
              {u.province && u.city && u.province !== u.city ? `${u.province}-${u.city}` : (u.province || u.city)}
            </span>
          ) : null}
          {typeof u.softRanking === 'number' ? (
            <span className="pgv2-tag tone-muted" title={isPrivate ? '民办院校按软科民办榜单独排名' : undefined}>
              软科{isPrivate ? '民办' : ''} #{u.softRanking}
            </span>
          ) : null}
          {s.regionMatch ? <span className="pgv2-tag tone-stable-soft">意向地区</span> : null}
        </div>
        <div className="pgv3-uni-summary">
          够得着 <strong>{s.groupCount ?? groups.length}</strong> 个专业组{' '}
          <span className="sp-chong">冲 {spread.chong}</span>
          <span className="sp-wen">稳 {spread.wen}</span>
          <span className="sp-bao">保 {spread.bao}</span>
        </div>
        {/* 转专业政策(院校级): 有才显示, 单行截断+悬停看全文(与专业优先卡 CardV3 同口径/同 CSS) */}
        {u.transferPolicy ? (
          <div className="pgv3-transfer" title={u.transferPolicy}>
            <span className="t-label">转专业</span>
            <span className="t-text">{u.transferPolicy}</span>
          </div>
        ) : null}
      </div>

      {/* —— 组子行(平铺, 无折叠) —— */}
      <div>
        {groups.map((g) => {
          const added = isGroupAdded(g);
          const grad = g.suggestedGradient ?? g.dynamicGradient?.gradient ?? 'WEN';
          // 冲稳保之外再分两档(按组门槛位次差 rankGapRatio): 够不着 / 分数偏低 → 整行灰显
          const edge = g.dynamicGradient?.rankGapRatio;
          const reachFar = typeof edge === 'number' && edge < -0.45;
          const tooLow = typeof edge === 'number' && edge > 0.5;
          const muted = reachFar || tooLow;
          const barTone = reachFar ? 't-reach' : tooLow ? 't-low'
            : GRAD_TONE[grad] === 'rush' ? 't-rush' : GRAD_TONE[grad] === 'safe' ? 't-safe' : 't-stable';
          const pur = g.purity?.level ? PURITY_TONE[g.purity.level] : null;
          const adjusted = g.dynamicGradient?.adjustedMinRank;
          const basis = adjusted ?? g.groupMinRank;
          const gap = gapText(studentRank, basis);
          const isSoft = (g.softFailCount ?? 0) > 0;
          // 组内无可填专业(全部资格不符)→ 锁定不可填
          const noPass = g.majorCount === 0 || (Array.isArray(g.majors) && g.majors.length === 0);
          const isHard = noPass && Array.isArray(g.hardFailMajors) && g.hardFailMajors.length > 0;
          const anchor = g.majorSections?.recommended?.[0]?.majorName ?? g.majors?.[0]?.majorName ?? null;
          const cnt = g.majorCount ?? g.majors?.length ?? 0;
          const smallBatch = typeof g.currentPlanCount === 'number' && g.currentPlanCount > 0 && g.currentPlanCount <= 5;
          // grow-signals 行: 全用真实字段(纯净度/招生类别/招生计划 vs 去年同组), 不引入设计稿 mock(hit/chg)
          const planNow = typeof g.currentPlanCount === 'number' ? g.currentPlanCount : null;
          const planPrev = typeof g.previousPlanCount === 'number' ? g.previousPlanCount : null;
          const planDelta = planNow != null && planPrev != null ? planNow - planPrev : null;
          const recruit = g.recruitType ? String(g.recruitType) : null;
          const isExpanded = openKey === g.groupKey;
          // 趋势线: 院校组用 g.history3y (近 3 年录取), 缺则显"无历史录取线/需人工判断"
          const trend = Array.isArray(g.history3y) && g.history3y.length >= 2 ? g.history3y : null;
          const predConf = String(g.predictedMinRank?.confidence ?? '');
          const predConfLabel = ({ HIGH: '高', MEDIUM: '中', LOW: '低' } as Record<string, string>)[predConf] || '—';
          const sections = g.majorSections ?? { recommended: g.majors ?? [], backup: [], risk: [] };
          return (
            <div className="pgv3-grow-wrap" key={g.groupKey}>
            <div
              className={`pgv3-grow ${muted ? 'is-muted' : ''} ${isSoft ? 'status-soft' : ''}`}
              title={reachFar ? '该专业组录取门槛位次远好于学生, 差距过大、基本够不着, 仅供参考。老师可自主决策。'
                : tooLow ? '学生位次远高于该专业组录取门槛, 报考可能浪费分数。老师可自主决策。' : undefined}
            >
              <span className={`gbar ${barTone}`} />
              <span>
                <span className="gcode">{g.groupCode ?? '—'}</span>
                {g.subjects ? <span className="gsub" style={{ display: 'block' }}>{g.subjects}</span> : null}
              </span>
              <span>
                {muted ? (
                  <span className="pgv2-dist-flag">{reachFar ? '够不着' : '分数偏低'}</span>
                ) : (
                  <span className={`pgv2-tier-tag tone-${GRAD_TONE[grad] ?? 'stable'}`}>{GRAD_LABEL[grad] ?? grad}</span>
                )}
              </span>
              <span className="grank">
                末位 <b>{fmt(g.groupMinRank)}</b>
                {gap ? (
                  <span
                    className={`gdiff ${gap.ahead ? 'ahead' : 'behind'}`}
                    style={{ display: 'block' }}
                  >
                    ({gap.txt})
                  </span>
                ) : null}
              </span>
              <span className="gplan">
                招生 {g.currentPlanCount ?? '—'} 人
                {smallBatch ? (
                  <span className="pgv3-small-batch" style={{ marginLeft: 4 }} title="招生人数少, 录取位次波动大">小批量</span>
                ) : null}
              </span>
              <span className="gmajor" title={anchor ?? undefined}>
                {isSoft ? <span className="pgv2-status-flag s-soft" style={{ marginRight: 5 }}>软不符</span> : null}
                {anchor ?? `${cnt} 专业`}{anchor && cnt > 1 ? ` 等${cnt}专业` : ''}
              </span>
              <span className="gacts">
                <button
                  className="pgv3-grow-detail"
                  type="button"
                  onClick={() => setOpenKey((k) => (k === g.groupKey ? null : g.groupKey))}
                >
                  {openKey === g.groupKey ? '收起' : '详情'}
                </button>
                {added ? (
                  <span className="pgv3-grow-added">✓ 已加入</span>
                ) : isHard ? (
                  <button className="pgv3-grow-add locked" type="button" disabled title="组内无可填专业(均资格不符), 不可加入">
                    🔒 不可填
                  </button>
                ) : (
                  <button
                    className={`pgv3-grow-add ${isSoft ? 'soft' : ''}`}
                    type="button"
                    onClick={() => onAddGroup(g)}
                    title={isSoft ? '组内含软规则风险专业(学费/办学/中外等), 确认后可加入' : undefined}
                  >
                    {isSoft ? '⚠ 确认风险后加入' : '+ 加入'}
                  </button>
                )}
              </span>
              {/* grow-signals: 纯净度 / 招生类别 / 招生计划增减 / 征集 —— 对齐设计稿 dchip 行, 数据全真 */}
              {(pur || recruit || planNow != null || (g.supplementary?.totalPlanCount ?? 0) > 0) ? (
                <span className="grow-signals">
                  {pur ? (
                    <span className={`pgv2-dchip tone-${pur.tone}`} title={pur.desc}>纯净度 {pur.label}</span>
                  ) : null}
                  {planNow != null ? (
                    <span className="pgv2-dchip tone-accent" title="本组 2026 招生计划及相对去年同组增减">
                      招生 {planNow} 人{planDelta ? (planDelta > 0 ? ` +${planDelta}` : ` ${planDelta}`) : ''}
                    </span>
                  ) : null}
                  {recruit ? <span className="pgv2-dchip tone-neutral">{recruit}</span> : null}
                  {g.supplementary && g.supplementary.totalPlanCount > 0 ? (() => {
                    // 组级征集 (院校优先视图同样透出, 与专业优先 CandidateCardV3 口径一致)
                    const sy = g.supplementary.sourceYear;
                    const rounds = g.supplementary.byYear?.[sy]?.rounds;
                    const perRound = Array.isArray(rounds) && rounds.length ? rounds.map((r: any) => r.count).join('/') : null;
                    return (
                      <span className="pgv2-dchip tone-safe-soft" title={`${sy} 年本组累计征集 ${g.supplementary.totalPlanCount} 人 / ${g.supplementary.totalRounds} 轮${perRound ? ` (分轮 ${rounds.map((r: any) => `第${r.round}轮 ${r.count}人`).join(' / ')})` : ''}。征集=没招满需补录, 常伴随降分, 是可达性的积极信号`}>征集 {g.supplementary.totalPlanCount}人{perRound ? ` (${perRound})` : `/${g.supplementary.totalRounds}轮`}</span>
                    );
                  })() : null}
                </span>
              ) : null}
            </div>

            {/* —— 卡内内联展开: 匹配环 + 偏好 + 趋势 + 6 项就业指标 + 专业行 —— */}
            {isExpanded && (
              <div className="pgv3-grow-expand">
                <div className="pgv2-match-header">
                  <MatchRing score={g.matchScore} />
                  <div className="pgv2-match-body">
                    <div className="pgv2-match-reason">{g.matchReason ?? '—'}</div>
                    <div className="pgv2-pref-row">
                      <PrefDot ok={g.prefMatch?.province === 'match'} label="地域" />
                      <PrefDot ok={g.prefMatch?.tuition === 'within'} label="学费" />
                      <PrefDot ok={g.prefMatch?.career === 'strong'} label="职业" />
                    </div>
                  </div>
                  {trend ? (
                    <div className="pgv2-trend-mini">
                      <Sparkline data={trend} />
                      <div className="pgv2-trend-meta">
                        <span className="t-range">{trend[0].score} → {trend[trend.length - 1].score}</span>
                        <span className="t-pred">
                          ◇ 预测 ~{g.predictedMinRank?.point?.toLocaleString() || '—'} 位
                          <span className={`t-conf c-${predConf.toLowerCase()}`}>{predConfLabel}</span>
                        </span>
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

                {/* —— 6 项就业指标 ——
                     rate 字段是已带 '%' 的字符串(如 '96.4%'), 故仅在缺 '%' 时补, 避免 '%%' */}
                <div className="pgv2-metric-bar">
                  <MBar k="招生" v={g.currentPlanCount} suffix=" 人" chg={g.planCountChange} />
                  <MBar k="考研率" v={g.university?.postgradRate} suffix={pctSuffix(g.university?.postgradRate)} />
                  <MBar k="深造率" v={g.university?.furtherStudyRate} suffix={pctSuffix(g.university?.furtherStudyRate)} />
                  <MBar k="就业率" v={g.university?.employmentRate} suffix={pctSuffix(g.university?.employmentRate)} />
                  <MBar k="平均薪资" v={g.university?.avgSalary} suffix="" />
                  <MBar k="满意度" v={g.university?.satisfactionOverall} suffix={g.university?.satisfactionOverall != null ? `/5 · ${g.university?.satisfactionCount ?? 0}人` : ''} />
                </div>

                {/* —— 专业行(复用候选卡组件, onAdd 加入整组) —— */}
                <CandidateMajorSection title="推荐填写" section="RECOMMENDED" majors={sections.recommended ?? []} group={g} onAdd={() => onAddGroup(g)} />
                <CandidateMajorSection title="可备选" section="BACKUP" majors={sections.backup ?? []} group={g} onAdd={() => onAddGroup(g)} />
                <CandidateMajorSection title="风险/不建议" section="RISK" majors={sections.risk ?? []} group={g} onAdd={() => onAddGroup(g)} />
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
