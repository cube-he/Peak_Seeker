'use client';

import { Tag } from 'antd';

/**
 * 院校优先视图的院校卡。
 * 头部 = 院校信息（名称/代码/层次标签/地域/软科排名/意向标记/冲稳保分布）
 * 体部 = 该校「够得着」的专业组子行（组码/选科/梯度/纯净度/末位/专业数 + 加入/详情）
 *
 * 加入: 子行点「加入」→ onAddGroup(group), 走现有 addCandidateGroup 流程, 产物与专业优先一致。
 * 详情: 点「详情」→ onOpenDetail(group), 开页面现有的专业组复核 Drawer。
 *
 * 视觉为功能性布局, 精细样式后续交 claude-design。
 */

const GRAD_LABEL: Record<string, string> = { CHONG: '冲', WEN: '稳', BAO: '保' };
const GRAD_COLOR: Record<string, string> = { CHONG: 'red', WEN: 'blue', BAO: 'green' };

const PURITY_META: Record<string, { label: string; color: string }> = {
  S: { label: '干净', color: 'green' },
  A: { label: '较纯', color: 'cyan' },
  B: { label: '较乱', color: 'orange' },
  C: { label: '混乱', color: 'red' },
};

interface Props {
  university: any; // CandidateUniversity (后端 rollup 结构)
  studentRank?: number | null; // 学生位次, 用于显示组末位差距
  isGroupAdded: (group: any) => boolean;
  onAddGroup: (group: any) => void;
  onOpenDetail: (group: any) => void;
}

const fmt = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—');

// 学生位次 vs 组末位的差距文案 (末位数字越大=越容易进)
function rankGapText(studentRank: number | null | undefined, groupMinRank: unknown): string {
  if (typeof studentRank !== 'number' || typeof groupMinRank !== 'number' || groupMinRank <= 0) return '';
  const diff = groupMinRank - studentRank; // 正=学生领先(更靠前/更稳)
  const k = Math.abs(diff) >= 10000 ? `${(Math.abs(diff) / 10000).toFixed(1)}万` : `${(Math.abs(diff) / 1000).toFixed(0)}k`;
  if (diff > 0) return `领先 ${k}`;
  if (diff < 0) return `落后 ${k}`;
  return '持平';
}

export default function UniversityCandidateCard({
  university,
  studentRank,
  isGroupAdded,
  onAddGroup,
  onOpenDetail,
}: Props) {
  const u = university.university ?? {};
  const s = university.summary ?? {};
  const spread = s.gradientSpread ?? { chong: 0, wen: 0, bao: 0 };
  const groups: any[] = Array.isArray(university.groups) ? university.groups : [];
  // 民办: 软科榜按办学性质分别排名, 民办的 softRanking 是民办分类排名, 需标注区分
  const isPrivate = String(u.runningNature ?? '').includes('民办');
  // 非意向地区(院校级属性, 同校所有组一致): 灰显区分 —— 不替老师藏, 但视觉降级, 老师自主决策。
  const regionMismatch = groups.some((g: any) => g?.regionMismatch);

  return (
    <div
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        background: 'var(--surface, #fff)',
        marginBottom: 12,
        overflow: 'hidden',
        // 非意向地区 → 灰显(去饱和+降透明), 一眼区分"不在意向地区, 可权衡"
        opacity: regionMismatch ? 0.6 : 1,
        filter: regionMismatch ? 'grayscale(0.55)' : undefined,
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border, #eee)',
          background: s.isPreferred ? 'var(--primary-bg, #f0f7ff)' : 'var(--surface-alt, #fafafa)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {university.universityName}
          </span>
          {university.universityCode && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{university.universityCode}</span>
          )}
          {s.isPreferred && (
            <Tag color="gold" style={{ marginInlineEnd: 0 }}>
              意向院校{s.preferredRank ? ` #${s.preferredRank}` : ''}
            </Tag>
          )}
          {regionMismatch && (
            <Tag color="default" style={{ marginInlineEnd: 0, color: '#8c8c8c', borderStyle: 'dashed' }}>
              非意向地区
            </Tag>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 6,
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {u.is985 && <Tag color="red">985</Tag>}
          {u.is211 && <Tag color="volcano">211</Tag>}
          {u.isDoubleFirstClass && <Tag color="purple">双一流</Tag>}
          {u.firstClassCategory && <Tag color="geekblue">{u.firstClassCategory}</Tag>}
          {/* 院校背景标签 (卓越教师/C9联盟等), '/' 分隔最多 4 个 */}
          {String(u.universityBackground ?? '')
            .split('/')
            .map((t: string) => t.trim())
            .filter(Boolean)
            .filter((t: string) => !['985', '211', '双一流', '一流学科', '一流大学'].some((x) => t.includes(x)))
            .slice(0, 4)
            .map((t: string) => (
              <Tag key={t} color="blue" title={u.universityBackground}>
                {t}
              </Tag>
            ))}
          {typeof u.softRanking === 'number' && (
            <span title={isPrivate ? '民办院校按软科民办榜单独排名' : undefined}>
              软科{isPrivate ? '民办' : ''} #{u.softRanking}
            </span>
          )}
          {(u.province || u.city) && (
            <span>
              {u.province ?? ''} {u.city ?? ''}
            </span>
          )}
          {s.regionMatch && <Tag color="blue">意向地区</Tag>}
          {u.runningNature && <span>· {u.runningNature}</span>}
        </div>

        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          够得着 <strong>{s.groupCount ?? groups.length}</strong> 个专业组 ·{' '}
          <span style={{ color: '#cf1322' }}>冲 {spread.chong}</span>{' '}
          <span style={{ color: '#1677ff' }}>稳 {spread.wen}</span>{' '}
          <span style={{ color: '#389e0d' }}>保 {spread.bao}</span>
        </div>
      </div>

      {/* 组子行 */}
      <div>
        {groups.map((g) => {
          const added = isGroupAdded(g);
          const grad = g.suggestedGradient ?? g.dynamicGradient?.gradient ?? 'WEN';
          const pur = g.purity?.level as string | undefined;
          // 在冲稳保之外再分两档(按修正后位次差距 rankGapRatio = 门槛位次/学生位次 - 1):
          // 够不着 = 门槛位次远好于学生(差距过大, 极冲之上); 偏低 = 学生远高于门槛(可能浪费分, 低保之下)。
          // 这两档照常显示, 但整行灰显区分, 不替老师藏 —— 阈值可调。
          const edge = g.dynamicGradient?.rankGapRatio;
          const reachFar = typeof edge === 'number' && edge < -0.45;
          const tooLow = typeof edge === 'number' && edge > 0.5;
          const extreme = reachFar || tooLow;
          return (
            <div
              key={g.groupKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                fontSize: 13,
                opacity: extreme ? 0.55 : 1,
                filter: extreme ? 'grayscale(0.6)' : undefined,
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 56 }}>
                {g.groupCode ?? '—'}
              </span>
              {g.subjects && (
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{g.subjects}</span>
              )}
              <Tag color={GRAD_COLOR[grad] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                {GRAD_LABEL[grad] ?? grad}
              </Tag>
              {reachFar && (
                <Tag color="default" style={{ marginInlineEnd: 0, color: '#8c8c8c', borderStyle: 'dashed' }} title="该专业组录取门槛位次远好于学生, 差距过大、基本够不着, 仅供参考。老师可自主决策。">
                  够不着
                </Tag>
              )}
              {tooLow && (
                <Tag color="default" style={{ marginInlineEnd: 0, color: '#8c8c8c', borderStyle: 'dashed' }} title="学生位次远高于该专业组录取门槛, 报考可能浪费分数。老师可自主决策。">
                  分数偏低
                </Tag>
              )}
              {pur && PURITY_META[pur] && (
                <Tag color={PURITY_META[pur].color} style={{ marginInlineEnd: 0 }}>
                  {PURITY_META[pur].label}
                </Tag>
              )}
              <span style={{ color: 'var(--text-secondary)' }}>
                末位 {fmt(g.groupMinRank)}
                {(() => {
                  // 位次差按"修正后位次"算, 与梯度 chip 同口径 (避免"落后但稳"自相矛盾)。
                  // 加"修正后"前缀消歧: 领先/落后是相对 2026 修正位次, 不是相对上面显示的历史末位。
                  const adjusted = g.dynamicGradient?.adjustedMinRank;
                  const basis = adjusted ?? g.groupMinRank;
                  const gap = rankGapText(studentRank, basis);
                  if (!gap) return null;
                  const ahead = gap.startsWith('领先') || gap === '持平';
                  return (
                    <span
                      style={{ marginLeft: 4, fontSize: 12, color: ahead ? '#389e0d' : '#cf1322' }}
                      title={adjusted ? `2026 修正位次约 ${adjusted.toLocaleString()}（按招生计划/竞争变化校正历史末位）` : undefined}
                    >
                      ({adjusted ? '修正后' : ''}{gap})
                    </span>
                  );
                })()}
              </span>
              {g.currentPlanCount != null && (
                <span style={{ color: 'var(--text-tertiary)' }}>
                  招生 {g.currentPlanCount} 人
                  {typeof g.currentPlanCount === 'number' && g.currentPlanCount > 0 && g.currentPlanCount <= 5 && (
                    <Tag color="orange" style={{ marginLeft: 4, marginInlineEnd: 0 }} title="招生人数少, 录取位次波动大">
                      小批量
                    </Tag>
                  )}
                </span>
              )}
              {(() => {
                // 内联代表专业名, 比"N专业"更直观
                const anchor =
                  g.majorSections?.recommended?.[0]?.majorName ?? g.majors?.[0]?.majorName ?? null;
                const cnt = g.majorCount ?? g.majors?.length ?? 0;
                if (!anchor) {
                  return <span style={{ color: 'var(--text-tertiary)' }}>{cnt} 专业</span>;
                }
                return (
                  <span
                    style={{
                      color: 'var(--text-tertiary)',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={anchor}
                  >
                    {anchor}
                    {cnt > 1 ? ` 等${cnt}专业` : ''}
                  </span>
                );
              })()}

              <span style={{ flex: 1 }} />

              <button
                type="button"
                onClick={() => onOpenDetail(g)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border, #d9d9d9)',
                  color: 'var(--text-secondary)',
                  padding: '4px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                详情
              </button>
              {added ? (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, padding: '4px 8px' }}>已加入</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddGroup(g)}
                  style={{
                    background: 'var(--primary, #1677ff)',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 14px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  加入
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
