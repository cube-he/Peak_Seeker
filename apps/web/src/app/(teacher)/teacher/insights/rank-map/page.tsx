'use client';

/**
 * 教师工作台 · 位次档位地图
 * 工具页: 给定位次 + 科类, 显示能进/不能进哪些批次, 配速查表与档位条形图.
 * 数据源: /data/rank-map-2025.json (静态, 高考后每年重跑一次).
 *
 * URL 参数:
 *   ?rank=65000&track=物理         手动给定位次, 自动填入
 *   ?studentId=23                  (TODO 下一迭代) 自动 fetch 学生位次
 *
 * 入口:
 *   1. 左导航 (commNavItems) 「位次档位」
 *   2. /teacher/students/[id]/batch-recommendations 顶部按钮跳转
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/willnest';
import LazyEChart from '@/components/ui/LazyEChart';

type Track = '物理' | '历史';

interface BatchEntry {
  序号: number;
  投档顺序排序: number;
  投档顺序: string;
  录取批次: string;
  招生类型: string;
  招生计划: number | null;
  实际录取: number | null;
  最低分: number | null;
  最低位次: number | null;
  组数: number | null;
  主表对齐: boolean;
  累计招生计划: number;
  累计实际录取: number;
}

interface RankBand {
  min: number;
  max: number | null;
  label: string;
  desc: string;
}

interface TrackData {
  参考人数: number;
  招生计划合计: number;
  实际录取合计: number;
  batches: BatchEntry[];
}

interface RankMapData {
  version: string;
  year: number;
  province: string;
  tracks: Record<Track, TrackData>;
  rankBands: Record<Track, RankBand[]>;
}

function bandOfRank(rank: number, bands: RankBand[]): RankBand | null {
  for (const b of bands) {
    const lo = b.min;
    const hi = b.max ?? Infinity;
    if (rank >= lo && rank < hi) return b;
  }
  return null;
}

// 学生位次 vs 批次末档位次 → 冲/稳/保/无望
type Verdict = '冲' | '稳' | '保' | '无望';
function verdict(studentRank: number, batchEndRank: number | null): Verdict | null {
  if (batchEndRank == null) return null;
  const diff = batchEndRank - studentRank; // 末档 - 学生; 正数 = 学生位次更靠前(更优)
  if (diff < 0) return '无望';
  // 末档比学生靠后 < 25% → 冲; 25%-100% → 稳; >100% → 保
  const ratio = diff / studentRank;
  if (ratio < 0.25) return '冲';
  if (ratio < 1.0) return '稳';
  return '保';
}
const VERDICT_TONE: Record<Verdict, { bg: string; color: string; label: string }> = {
  冲: { bg: '#fff1f0', color: '#cf1322', label: '冲' },
  稳: { bg: '#e6fffb', color: '#08979c', label: '稳' },
  保: { bg: '#f6ffed', color: '#389e0d', label: '保' },
  无望: { bg: '#fafafa', color: '#8c8c8c', label: '无望' },
};

export default function RankMapPage() {
  return (
    <Suspense
      fallback={
        <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
          加载中...
        </div>
      }
    >
      <RankMapPageInner />
    </Suspense>
  );
}

function RankMapPageInner() {
  const sp = useSearchParams();
  const [data, setData] = useState<RankMapData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [track, setTrack] = useState<Track>(
    (sp.get('track') as Track) || '物理',
  );
  const [rankInput, setRankInput] = useState<string>(sp.get('rank') || '');
  const studentRank = useMemo(() => {
    const n = Number(rankInput);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }, [rankInput]);

  useEffect(() => {
    fetch('/data/rank-map-2025.json')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setLoadErr(String(e)));
  }, []);

  // 仅取主表对齐 + 有最低位次的批次画图(没数据的批次不画)
  const trackData = data?.tracks[track];
  const usableBatches = useMemo(
    () => (trackData?.batches ?? []).filter((b) => b.最低位次 != null),
    [trackData],
  );

  // ECharts 横向 BarChart 配置
  const chartOption = useMemo(() => {
    if (!trackData) return null;
    // 按"最低位次"升序排列, 末档越小排越上
    const sorted = [...usableBatches].sort(
      (a, b) => (a.最低位次 ?? 0) - (b.最低位次 ?? 0),
    );
    const labels = sorted.map((b) => `${b.招生类型}·${shortBatchName(b.录取批次)}`);
    const values = sorted.map((b) => b.最低位次);

    const markLines = studentRank
      ? {
          symbol: 'none',
          lineStyle: { color: '#cf1322', width: 2, type: 'solid' },
          label: {
            formatter: `学生位次 ${studentRank.toLocaleString()}`,
            position: 'insideStartTop',
            color: '#cf1322',
            fontWeight: 600,
          },
          data: [{ xAxis: studentRank }],
        }
      : undefined;

    return {
      grid: { left: 200, right: 60, top: 20, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const p = params[0];
          const b = sorted[p.dataIndex];
          const v = studentRank ? verdict(studentRank, b.最低位次) : null;
          const tone = v ? VERDICT_TONE[v] : null;
          return `
            <div><b>${b.录取批次}</b></div>
            <div>${b.招生类型}</div>
            <div>末档位次: <b>${p.value.toLocaleString()}</b></div>
            <div>末档分: ${b.最低分 ?? '—'}</div>
            <div>招生计划: ${b.招生计划 ?? '—'} / 已录取 ${b.实际录取 ?? '—'}</div>
            ${
              tone
                ? `<div style="margin-top:4px;background:${tone.bg};color:${tone.color};padding:2px 8px;border-radius:4px;display:inline-block">${tone.label}</div>`
                : ''
            }
          `;
        },
      },
      xAxis: {
        type: 'value',
        name: '末档位次',
        nameLocation: 'middle',
        nameGap: 28,
        axisLabel: {
          formatter: (v: number) =>
            v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`,
        },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          fontSize: 11,
          width: 190,
          overflow: 'truncate',
        },
      },
      series: [
        {
          type: 'bar',
          data: values.map((v, i) => {
            const b = sorted[i];
            const tone = studentRank ? verdict(studentRank, b.最低位次) : null;
            const color = tone
              ? { 冲: '#ff7875', 稳: '#36cfc9', 保: '#73d13d', 无望: '#d9d9d9' }[tone]
              : '#5b8ff9';
            return { value: v, itemStyle: { color } };
          }),
          barWidth: 14,
          label: {
            show: true,
            position: 'right',
            formatter: (p: any) =>
              p.value >= 10000
                ? `${(p.value / 10000).toFixed(1)}万`
                : p.value.toLocaleString(),
            fontSize: 11,
          },
          markLine: markLines as any,
        },
      ],
    };
  }, [trackData, usableBatches, studentRank]);

  // 速查表: 按位次档位分组
  const bandTable = useMemo(() => {
    if (!data) return [];
    const bands = data.rankBands[track];
    return bands.map((band) => {
      const lo = band.min;
      const hi = band.max ?? Infinity;
      const inBand = usableBatches.filter(
        (b) => b.最低位次! >= lo && b.最低位次! < hi,
      );
      // 该档位之前(末档位次 < lo)的所有批次, 也对该档位的学生开放(因为学生位次更靠后)
      // 但展示焦点是"刚好落在该档的批次", 其他档显示 cumulative count
      return { band, items: inBand };
    });
  }, [data, track, usableBatches]);

  // 学生定位卡数据
  const studentCard = useMemo(() => {
    if (!data || !studentRank) return null;
    const myBand = bandOfRank(studentRank, data.rankBands[track]);
    const sorted = [...usableBatches].sort(
      (a, b) => (a.最低位次 ?? 0) - (b.最低位次 ?? 0),
    );
    const cards: Record<Verdict, BatchEntry[]> = { 冲: [], 稳: [], 保: [], 无望: [] };
    for (const b of sorted) {
      const v = verdict(studentRank, b.最低位次);
      if (v) cards[v].push(b);
    }
    return { myBand, cards };
  }, [data, studentRank, track, usableBatches]);

  if (loadErr) {
    return (
      <div className="view-transition" style={{ padding: 40 }}>
        加载数据失败: {loadErr}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="view-transition" style={{ padding: 80, textAlign: 'center' }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="view-transition">
      <PageHeader
        eyebrow="RANK MAP"
        title="位次档位地图"
        meta={
          <>
            <span>四川 {data.year} · 给定位次, 速判能进哪些批次</span>
            <span className="dot" />
            <span>数据来源 招生主表 + 一分一段表</span>
          </>
        }
        fresh={data.version}
        actions={
          <div className="range-toggle">
            <button
              type="button"
              className={track === '物理' ? 'is-active' : ''}
              onClick={() => setTrack('物理')}
            >
              物理类
            </button>
            <button
              type="button"
              className={track === '历史' ? 'is-active' : ''}
              onClick={() => setTrack('历史')}
            >
              历史类
            </button>
          </div>
        }
      />

      {/* 控制条 */}
      <div
        className="fade-up d1"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          学生位次:
          <input
            type="number"
            inputMode="numeric"
            placeholder="例: 65000"
            value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
            style={{
              marginLeft: 8,
              width: 140,
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 14,
            }}
          />
        </label>
        {studentRank && trackData && (
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            占{track}类参考人数 ({trackData.参考人数.toLocaleString()}) 的
            <b style={{ color: 'var(--text-primary)', margin: '0 4px' }}>
              {((studentRank / trackData.参考人数) * 100).toFixed(1)}%
            </b>
          </span>
        )}
        {studentRank && studentCard && (
          <span
            style={{
              fontSize: 13,
              padding: '4px 10px',
              borderRadius: 4,
              background: 'var(--surface-alt, #fafafa)',
              border: '1px solid var(--border)',
            }}
          >
            档位:{' '}
            <b style={{ color: 'var(--text-primary)' }}>
              {studentCard.myBand?.label ?? '—'}
            </b>{' '}
            ({studentCard.myBand?.desc})
          </span>
        )}
      </div>

      {/* 学生定位卡 */}
      {studentCard && studentRank && (
        <div className="fade-up d2" style={{ marginBottom: 16 }}>
          <div className="in-card">
            <h4>
              学生位次 {studentRank.toLocaleString()} · {track}类 · 冲稳保
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
              {(['冲', '稳', '保'] as Verdict[]).map((v) => {
                const items = studentCard.cards[v];
                const tone = VERDICT_TONE[v];
                return (
                  <div
                    key={v}
                    style={{
                      background: tone.bg,
                      border: `1px solid ${tone.color}33`,
                      borderRadius: 6,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, color: tone.color, fontWeight: 600, marginBottom: 6 }}>
                      {tone.label} · {items.length} 类
                    </div>
                    {items.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>无</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {items.slice(0, 6).map((b) => (
                          <div key={b.序号} style={{ fontSize: 12 }}>
                            <span>{b.招生类型}</span>
                            <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                              {b.最低位次!.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {items.length > 6 && (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            +{items.length - 6} 类...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 位次轴图 */}
      <div className="in-card fade-up d3" style={{ marginBottom: 16 }}>
        <h4>{track}类 各批次末档位次条形图 (末档越短越难考)</h4>
        {chartOption && <LazyEChart option={chartOption} height={Math.max(360, usableBatches.length * 22 + 60)} />}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
          ※ 仅画出有 2025 录取数据的批次, 数据来自专业组录取结果. 部分提前批 (军事/飞行等) 录取数据未入库, 不画.
        </div>
      </div>

      {/* 速查表 */}
      <div className="in-card fade-up d4">
        <h4>{track}类 位次档位速查表</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {bandTable.map(({ band, items }) => {
            const isMyBand = studentCard?.myBand?.label === band.label;
            return (
              <div
                key={band.label}
                style={{
                  border: `1px solid ${isMyBand ? 'var(--primary, #1677ff)' : 'var(--border)'}`,
                  background: isMyBand ? 'var(--primary-bg, #e6f4ff)' : 'var(--surface)',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <b>{band.label}</b>
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 8, fontSize: 12 }}>
                      位次 {band.min.toLocaleString()} -{' '}
                      {band.max ? band.max.toLocaleString() : '末'}
                    </span>
                    {isMyBand && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary, #1677ff)' }}>
                        ← 学生在此档
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{band.desc}</span>
                </div>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>该档无新增批次</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {items.map((b) => (
                      <div
                        key={b.序号}
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          background: 'var(--surface-alt, #fafafa)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                        }}
                      >
                        <span>{b.招生类型}</span>
                        <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                          末档 {b.最低位次!.toLocaleString()}
                          {b.招生计划 != null && ` · 计划 ${b.招生计划}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 批次名简写, 让图表 y 轴不那么长
function shortBatchName(name: string): string {
  return name
    .replace('本科提前批', '提前')
    .replace('本科批', '本')
    .replace('高职(专科)', '专')
    .replace('(', '·')
    .replace(')', '');
}
