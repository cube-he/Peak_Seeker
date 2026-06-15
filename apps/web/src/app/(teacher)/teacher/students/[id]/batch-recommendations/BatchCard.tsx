'use client';
import { useState } from 'react';
import type { BatchRecommendation, ScoreInfo } from '@/services/batch-recommendations-api';
import { SubsetItem } from './SubsetItem';
import { TIcon } from './icons';
import {
  VERDICT_INFO, VOL_MODE_LABEL, LINE_LABEL,
  summarizeBatch, scoreToneClass,
} from './maps';

/**
 * §7.7 批次卡片 (默认折叠, 点击 header 展开).
 * - 左 3px verdict 语义色条 (::before)
 * - 自定义 checkbox (br-check), stopPropagation 避免误触 expand
 * - 折叠态一句话摘要 → 老师不展开也能判断
 * - 展开后: 分数信息行 + 子类别列表
 */
export function BatchCard({
  batch,
  checked,
  locked,
  onToggleCheck,
}: {
  batch: BatchRecommendation;
  checked: boolean;
  locked: boolean;
  onToggleCheck: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [showScore, setShowScore] = useState(false);

  const v = VERDICT_INFO[batch.verdict] ?? { txt: batch.verdict, tone: 'pending' as const };
  const summary = summarizeBatch(batch);
  const modeLabel = VOL_MODE_LABEL[batch.volunteerMode] ?? batch.volunteerMode;
  const subsets = batch.subsetResults ?? [];
  // 强基/高校专项要在高三当年 4 月前完成报名审核, 填报期才发现没报名 = 白勾。
  // 资格引擎只判硬条件不管时间窗, 这里按批次名给静态提醒。
  const registrationNote = /强基|高校专项/.test(batch.batchName)
    ? '需在当年 4 月前完成报名并通过高校审核,未提前报名的考生不具备投档资格'
    : null;

  const toggleSub = (code: string) => setOpenSubs(s => {
    const n = new Set(s);
    if (n.has(code)) n.delete(code); else n.add(code);
    return n;
  });

  return (
    <article
      className={`br-card v-${batch.verdict}${checked ? ' is-checked' : ''}${open ? ' is-open' : ''}`}
    >
      <div className="br-card-head" onClick={() => setOpen(o => !o)}>
        {/* checkbox: 不冒泡到 head 否则会触发展开 */}
        <span
          className={`br-check${checked ? ' on' : ''}`}
          aria-disabled={locked ? 'true' : 'false'}
          onClick={(e) => {
            e.stopPropagation();
            if (locked) return;
            onToggleCheck();
          }}
          title={locked ? '已锁定, 不可修改' : (checked ? '取消勾选' : '勾选此批次')}
        >
          {checked && <TIcon.check/>}
        </span>

        <div className="br-card-mid">
          <div className="br-card-title">
            <span className="name">{batch.batchName}</span>
            <span className="br-mode">志愿模式: {modeLabel}</span>
          </div>
          <div className={`br-card-summary${summary.tone ? ` tone-${summary.tone}` : ''}`}>
            {summary.text}
          </div>
          {registrationNote && (
            <div className="br-card-summary tone-rush">⏰ {registrationNote}</div>
          )}
        </div>

        <div className="br-card-right" onClick={(e) => e.stopPropagation()}>
          <span className={`br-verdict tone-${v.tone}`}>{v.txt}</span>
          <button className="br-expand" onClick={() => setOpen(o => !o)} title={open ? '收起' : '展开'}>
            <TIcon.chevDown/>
          </button>
        </div>
      </div>

      {open && (
        <div className="br-card-body">
          <div className="br-card-body-pad">
            <div className="br-subset-title">子类别 / 资格判定</div>
            {subsets.length === 0 ? (
              <div className="br-no-subset">无子类别信息</div>
            ) : (
              <div className="br-subset">
                {subsets.map(sub => (
                  <SubsetItem
                    key={sub.code}
                    subset={sub}
                    open={openSubs.has(sub.code)}
                    onToggle={() => toggleSub(sub.code)}
                  />
                ))}
              </div>
            )}

            {batch.scoreInfo && (
              <div style={{ marginTop: 10, borderTop: '1px dashed #e2e2dd', paddingTop: 8 }}>
                <span
                  onClick={() => setShowScore((s) => !s)}
                  style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#888' }}
                >
                  分数参考 {showScore ? '▲' : '▼'}
                </span>
                {showScore && <ScoreRow si={batch.scoreInfo} />}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/** §7.8.A 分数信息行 - 4 档配色 + 容错尾注 + 往年回退尾注 (D2/C2). */
function ScoreRow({ si }: { si: ScoreInfo }) {
  const lineLabel = LINE_LABEL[si.lineType] ?? '分数线';
  const yearNote = si.lineYearUsed ? `（按 ${si.lineYearUsed} 年线预估）` : '';

  if (si.lineMissing) {
    return (
      <div className="br-score s-muted">
        <span className="lbl">分数参考</span>
        <span className="main">当年{lineLabel}数据缺失</span>
      </div>
    );
  }
  if (si.studentScore == null || si.lineScore == null) {
    return (
      <div className="br-score s-muted">
        <span className="lbl">分数参考</span>
        <span className="main">{lineLabel}: {si.lineScore ?? '?'}，学生总分: {si.studentScore ?? '未填'}</span>
      </div>
    );
  }
  const cls = scoreToneClass(si);
  const gap = si.gap ?? 0;
  const sign = gap >= 0 ? '+' : '';
  return (
    <div className={`br-score ${cls}`}>
      <span className="lbl">分数参考</span>
      <span className="main">你 <strong>{si.studentScore}</strong> / {lineLabel} <strong>{si.lineScore}</strong></span>
      <span className="gap">{sign}{gap} 分</span>
      {(si.leniency ?? 0) > 0 && si.passesLine === false && si.withinLeniency && (
        <span className="tail">— 在 {si.leniency} 分容错内</span>
      )}
      {yearNote && <span className="tail">{yearNote}</span>}
    </div>
  );
}
