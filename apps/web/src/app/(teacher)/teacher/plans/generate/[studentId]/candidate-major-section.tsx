'use client';

/**
 * 专业组的「专业行」区块 (推荐填写 / 可备选 / 风险不建议)。
 *
 * 从 page.tsx 抽出, 供候选卡(CandidateCardV3)与院校卡(UniversityCandidateCard)共用。
 * 抽出原因: page.tsx 已 import UniversityCandidateCard, 若 UniversityCandidateCard 反过来
 * 从 page.tsx import 本组件会形成循环依赖。本文件不 import page.tsx, 自带所需 leaf helper
 * (与 CandidateCardV3 同样的"组件文件自带局部 helper + any 类型"惯例), 故无环。
 *
 * group/major 用 any: 与 CandidateCardV3 一致, 候选数据结构由调用方保证, 本组件只读字段。
 */

import { PlusOutlined } from '@ant-design/icons';
import styles from './candidate-pool-polished.module.css';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const GRADIENT_LABEL: Record<string, string> = {
  JI_CHONG: '够不着',
  CHONG: '冲',
  XIAO_CHONG: '小冲',
  WEN: '稳',
  WEN_BAO: '稳保',
  BAO: '保',
  QIANG_BAO: '强保',
  DIBAO: '兜底',
};

const MAJOR_SECTION_LABEL: Record<string, string> = {
  RECOMMENDED: '推荐填写',
  BACKUP: '可备选',
  RISK: '风险/不建议',
};

function gradientTier(item: any): string {
  return item?.dynamicGradient?.tier ?? item?.suggestedGradient ?? 'WEN';
}

function gradientTone(tier: string) {
  if (tier === 'JI_CHONG' || tier === 'CHONG' || tier === 'XIAO_CHONG') return 'rush';
  if (tier === 'BAO' || tier === 'QIANG_BAO' || tier === 'DIBAO') return 'safe';
  return 'stable';
}

function tagClass(tone: 'rush' | 'stable' | 'safe' | 'muted' | 'warn' | 'extreme') {
  const toneClass = {
    rush: styles.tagRush,
    stable: styles.tagStable,
    safe: styles.tagSafe,
    muted: styles.tagMuted,
    warn: styles.tagWarn,
    extreme: styles.tagExtreme,
  }[tone];
  return cx(styles.tag, toneClass);
}

export function getMajorSections(group: any): { recommended: any[]; backup: any[]; risk: any[] } {
  return group?.majorSections ?? {
    recommended: group?.majors ?? [],
    backup: [],
    risk: [],
  };
}

function majorSectionTone(section: string, major: any) {
  if (section === 'RISK') return 'warn';
  if (section === 'BACKUP') return 'muted';
  return major?.matchStatus === 'SOFT_FAIL' ? 'warn' : gradientTone(gradientTier(major));
}

export default function CandidateMajorSection({
  title,
  section,
  majors,
  group,
  onAdd,
  addingMajorKey,
}: {
  title: string;
  section: string;
  majors: any[];
  group?: any;
  onAdd?: (group: any, major: any) => void;
  addingMajorKey?: number | null;
}) {
  if (!majors.length) return null;
  // 视觉排序优先级 (不改 anchor 持久语义): 意向梯队命中最前, 搜索命中次之
  const sortedMajors = [...majors].sort((a, b) => {
    const ap = a.matchesPreferredTier ? 1 : 0;
    const bp = b.matchesPreferredTier ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.matchesKeyword ? 1 : 0) - (a.matchesKeyword ? 1 : 0);
  });
  return (
    <div className={styles.majorSection}>
      <div className={styles.majorSectionHead}>
        <span>{title}</span>
        <em>{majors.length}</em>
      </div>
      <div className="pgv2-major-rows pgv3-major-rows">
        <div className="pgv2-major-head pgv3-major-head">
          <span />
          <span>专业 · 代码 / 学费 / 学制 / 备注</span>
          <span>2026<br />招生计划</span>
          <span>历年录取 2025 → 2022 <i>计划 · 平均分(位次) · 最低分(位次)</i></span>
          <span>硕博</span>
          <span />
        </div>
        {sortedMajors.map((major) => {
          const isAdded = addingMajorKey === major.enrollmentPlanId;
          const evalText = major.disciplineEval && String(major.disciplineEval).trim() && String(major.disciplineEval).trim() !== '/' ? String(major.disciplineEval).trim() : null;
          const rankText = !evalText && major.majorRanking && String(major.majorRanking).trim() && String(major.majorRanking).trim() !== '/' ? String(major.majorRanking).trim() : null;
          // 专业 4 年录取序列 (后端 majorHistory4y, 倒推 2025→2022), 无数据则空数组
          const h4 = (major.majorHistory4y ?? []);
          const remark = major.planNotes && String(major.planNotes).trim() ? String(major.planNotes).trim() : null;
          return (
            <div
              key={major.enrollmentPlanId}
              className={`pgv2-major-row pgv3-major-row ${section === 'RISK' ? 'is-risk' : ''} ${major.matchStatus === 'SOFT_FAIL' ? 'is-soft' : ''}`}
              title={major.matchStatus === 'SOFT_FAIL' && major.failReasons?.length
                ? `软性风险: ${major.failReasons.map((r: any) => r.note).join('；')} —— 暖色提醒, 老师可权衡后加入。`
                : undefined}
            >
              {/* 1 星标 */}
              <span className={`pgv2-star ${section === 'RECOMMENDED' ? 'rec' : section === 'RISK' ? 'risk' : 'bak'}`}>★</span>
              {/* 2 专业名 + 评级/标签 + 学费/学制 + 招生报页码 + 备注 */}
              <span className="nm">
                <b>{major.majorName}{major.majorCode ? <i className="mcode">{major.majorCode}</i> : null}</b>
                {evalText ? (
                  <span className={`pgv2-eval-chip rank-${evalText.toLowerCase().replace('+', 'plus').replace('-', '')}`} title="学科评估等级(学校×专业)">{evalText}</span>
                ) : null}
                {rankText ? <span className="pgv2-rank-chip" title={`专业全国排名 第 ${rankText} 名`}>#{rankText}</span> : null}
                {major.isNationalFeature ? <span className="pgv2-mt-tag national">国家特色</span> : null}
                {major.isSinoForeign ? <span className="pgv2-mt-tag sino">中外</span> : null}
                {major.matchesKeyword ? <span className="pgv2-mt-tag" style={{ background: '#fffbe6', color: '#d48806', borderColor: '#ffe58f' }}>🔍 搜索</span> : null}
                {major.matchesPreferredTier ? <span className="pgv2-mt-tag" style={{ background: '#f6ffed', color: '#389e0d', borderColor: '#b7eb8f' }}>🎯 梯队意向</span> : null}
                {major.isRecommendedAnchor ? <span className="pgv2-mt-tag anchor">推荐锚定</span> : null}
                <span className="m-fee">
                  {major.tuition != null ? `学费 ${major.tuition.toLocaleString()} 元/年` : '学费 —'}
                  {major.duration ? ` · 学制 ${major.duration}` : null}
                </span>
                {major.bookPageNumber != null ? (
                  <span className="m-page" title="该专业在《2026 招生考试报》纸质专刊中的页码,便于人工逐条核对">招生报 P.{major.bookPageNumber}</span>
                ) : null}
                {remark ? <span className="m-remark" title={remark}><i>备注</i> {remark}</span> : null}
              </span>
              {/* 3 2026 招生计划 */}
              <span className="m-plan">
                <i className="pl-y">2026 招生计划</i>
                <span className="pl-row"><b className="pl-n">{major.planCount ?? '—'}</b><i className="pl-u">人</i></span>
              </span>
              {/* 4 历年录取 — 专业级 4 年(2025→2022)对齐矩阵: 计划 · 平均分(位次) · 最低分(位次) */}
              <span className="m-hist" title="本专业近 4 年(2025→2022)逐年:计划人数 / 平均分(位次) / 最低分(位次)">
                {h4.length > 0 ? (
                  <span className="mh-grid">
                    <i className="mh-corner" />
                    {h4.map((h: any) => (
                      <i className={`mh-yr ${h.year === 2025 ? 'cur' : ''}`} key={h.year}>{h.year === 2025 ? '2025' : `'${String(h.year).slice(2)}`}</i>
                    ))}

                    <i className="mh-lbl">计划</i>
                    {h4.map((h: any) => {
                      // 该年分轮征集明细 (后端 supplementaryRoundsByYear), 在计划数后展示 (5/3)
                      const sr = major.supplementaryRoundsByYear?.[h.year];
                      const suppTxt = Array.isArray(sr) && sr.length ? sr.map((x: any) => x.count).join('/') : null;
                      return (
                        <i className={`mh-cell plan ${h.year === 2025 ? 'cur' : ''}`} key={h.year}>
                          {h.planCount != null ? <b>{h.planCount}</b> : <em className="nw">—</em>}
                          {suppTxt ? (
                            <span className="supp" title={`${h.year} 年本专业征集: ${sr.map((x: any) => `第${x.round}轮 ${x.count}人`).join(' / ')}。征集=未招满需补录, 常伴降分`}>({suppTxt})</span>
                          ) : null}
                        </i>
                      );
                    })}

                    <i className="mh-lbl">平均</i>
                    {h4.map((h: any) => (
                      <i className={`mh-cell ${h.year === 2025 ? 'cur' : ''}`} key={h.year}>
                        {h.avgScore != null ? <><b>{h.avgScore}</b>{h.avgRank != null ? <u>{h.avgRank.toLocaleString()}</u> : null}</> : <em className="nw">—</em>}
                      </i>
                    ))}

                    <i className="mh-lbl">最低</i>
                    {h4.map((h: any, hi: number) => {
                      const older = h4[hi + 1];
                      let mtrend: 'up' | 'down' | 'flat' | null = null;
                      if (h.minScore != null && older && older.minScore != null) {
                        const d = h.minScore - older.minScore;
                        mtrend = d >= 2 ? 'up' : d <= -2 ? 'down' : 'flat';
                      }
                      return (
                        <i className={`mh-cell min ${h.year === 2025 ? 'cur' : ''}`} key={h.year}>
                          {h.minScore != null ? (
                            <>
                              <b>{h.minScore}{mtrend ? <em className={`mht ${mtrend}`} title={mtrend === 'up' ? '较上一年最低分走高 · 竞争升温' : mtrend === 'down' ? '较上一年最低分走低 · 难度回落' : '较上一年基本持平'}>{mtrend === 'up' ? '↗' : mtrend === 'down' ? '↘' : '→'}</em> : null}</b>
                              {h.minRank != null ? <u>{h.minRank.toLocaleString()}</u> : null}
                            </>
                          ) : <em className="nw">—</em>}
                        </i>
                      );
                    })}
                  </span>
                ) : <span className="h3none">无史线<br />需人工判断</span>}
              </span>
              {/* 5 硕/博点 */}
              <span className="dg">
                {major.localMasterPoint || major.localDoctoralPoint ? (
                  <i className="dg-pill">{[major.localMasterPoint ? '硕' : null, major.localDoctoralPoint ? '博' : null].filter(Boolean).join('·')}</i>
                ) : <i className="none">—</i>}
              </span>
              {/* 6 操作 */}
              <span className="op">
                {group && onAdd ? (
                  <button
                    type="button"
                    className={`pgv2-add-btn major ${isAdded ? 'added' : ''}`}
                    onClick={() => onAdd(group, major)}
                    disabled={isAdded}
                  >
                    {isAdded ? '✓ 已加入' : <><PlusOutlined /> 加入</>}
                  </button>
                ) : (
                  <span className={tagClass(majorSectionTone(section, major))}>
                    {section === 'RISK' ? MAJOR_SECTION_LABEL.RISK : section === 'BACKUP' ? MAJOR_SECTION_LABEL.BACKUP : GRADIENT_LABEL[gradientTier(major)]}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
