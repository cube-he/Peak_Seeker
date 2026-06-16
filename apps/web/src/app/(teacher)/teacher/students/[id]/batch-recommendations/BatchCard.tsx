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
 * §7.7 批次卡片 (单行紧凑版 — 设计稿重做版).
 * - 点卡片主体 = 勾选 / 取消; 点右侧详情按钮才展开
 * - 单行: 自定义 checkbox + 批次名 + 状态词(dot + verdict + 待核实药丸) + 详情按钮
 * - 展开后: 志愿模式 + 分数信息行(平铺) + 子类别列表
 * - 强基/高校专项报名时间窗提醒挂在名字下方 (资格引擎不判时间窗)
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

  const v = VERDICT_INFO[batch.verdict] ?? { txt: batch.verdict, tone: 'pending' as const };
  const summary = summarizeBatch(batch);
  const modeLabel = VOL_MODE_LABEL[batch.volunteerMode] ?? batch.volunteerMode;
  const subsets = batch.subsetResults ?? [];
  // CONDITIONAL 时在状态词后加"待核实 N"小药丸 (§7.7)
  const needVerify = subsets
    .flatMap(s => s.rulesEval ?? [])
    .filter(r => r.pass === 'UNCERTAIN' || r.pass === 'SOFT_HINT').length;
  // 强基/高校专项要在高三当年 4 月前完成报名审核, 填报期才发现没报名 = 白勾。
  // 资格引擎只判硬条件不管时间窗, 这里按批次名给静态提醒。
  const registrationNote = /强基|高校专项/.test(batch.batchName)
    ? '需在当年 4 月前完成报名并通过高校审核，未提前报名的考生不具备投档资格'
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
      {/* 点 head = 勾选/取消; 不冒泡的详情按钮才展开 */}
      <div
        className="br-card-head"
        onClick={() => { if (!locked) onToggleCheck(); }}
        title={
          batch.verdict === 'INELIGIBLE'
            ? summary.text
            : (locked ? '已锁定, 不可修改' : (checked ? '点此取消' : '点此选择'))
        }
      >
        <span className={`br-check${checked ? ' on' : ''}`} aria-disabled={locked ? 'true' : 'false'}>
          {checked && <TIcon.check/>}
        </span>

        {registrationNote ? (
          <div className="br-row-mid">
            <span className="br-row-name">{batch.batchName}</span>
            <span className="br-row-hint tone-rush">⏰ {registrationNote}</span>
          </div>
        ) : (
          <span className="br-row-name">{batch.batchName}</span>
        )}

        <span className={`br-status tone-${v.tone}`}>
          <i className="dot"/>{v.txt}
          {batch.verdict === 'CONDITIONAL' && needVerify > 0 && (
            <em className="vneed">待核实{needVerify}</em>
          )}
        </span>

        <button
          className="br-row-detail"
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          title={open ? '收起' : (batch.verdict === 'INELIGIBLE' ? '查看不合原因' : '查看资格要求')}
        >
          <span className={`chev${open ? ' up' : ''}`}><TIcon.chevDown/></span>
        </button>
      </div>

      {open && (
        <div className="br-card-body">
          <div className="br-card-body-pad">
            <div className="br-card-mode">志愿模式：{modeLabel}</div>

            {/* §7.8.A 分数信息行: 设计稿重做版直接平铺, 不再二级折叠 */}
            {batch.scoreInfo && <ScoreRow si={batch.scoreInfo} />}

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
