'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Drawer, Table } from 'antd';
import { useUniversityCompare } from '@/stores/compareStore';
import { useStudentRank } from '@/stores/studentRankStore';
import type { UniversityListItem } from '@/services/university';

/**
 * 全局院校对比浮条 + 抽屉 (挂在 MainLayout)。
 * 清单在 compareStore: 列表页勾选、详情页加入, 任何页面可见可打开。
 */
export default function CompareDock() {
  const list = useUniversityCompare((s) => s.list);
  const toggle = useUniversityCompare((s) => s.toggle);
  const clear = useUniversityCompare((s) => s.clear);
  const examType = useStudentRank((s) => s.examType);
  const [open, setOpen] = useState(false);

  if (list.length === 0) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--primary, #1e3a5f)',
          color: '#fff',
          borderRadius: 999,
          padding: '8px 16px',
          boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        }}
      >
        {list.map((c) => (
          <span
            key={c.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(255,255,255,.15)',
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: 12,
            }}
          >
            {c.name}
            <span style={{ cursor: 'pointer', fontSize: 10 }} onClick={() => toggle(c)}>✕</span>
          </span>
        ))}
        <button
          type="button"
          disabled={list.length < 2}
          onClick={() => setOpen(true)}
          style={{
            border: 0,
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: list.length >= 2 ? 'pointer' : 'not-allowed',
            background: list.length >= 2 ? 'var(--accent, #b8860b)' : 'rgba(255,255,255,.2)',
            color: list.length >= 2 ? '#fff' : 'rgba(255,255,255,.5)',
          }}
        >
          对比 ({list.length})
        </button>
        <button
          type="button"
          onClick={clear}
          style={{ border: 0, background: 'transparent', color: 'rgba(255,255,255,.6)', fontSize: 12, cursor: 'pointer' }}
        >
          清空
        </button>
      </div>

      <Drawer
        title={`院校对比 (${list.length})`}
        open={open}
        onClose={() => setOpen(false)}
        width={Math.min(300 + list.length * 220, 1180)}
      >
        <Table
          size="small"
          bordered
          pagination={false}
          rowKey="metric"
          columns={[
            { title: '指标', dataIndex: 'metric', width: 110, fixed: 'left' as const },
            ...list.map((u, i) => ({
              title: (
                <Link href={`/universities/${u.id}`} style={{ color: 'var(--primary)' }}>
                  {u.name}
                </Link>
              ),
              dataIndex: `v${i}`,
              width: 200,
              render: (v: any) => (v == null || v === '' ? <span style={{ color: 'var(--text-muted)' }}>--</span> : v),
            })),
          ]}
          dataSource={buildUniCompareRows(list, examType as '物理' | '历史')}
        />
      </Drawer>
    </>
  );
}

// 对比行: 值取勾选时的列表/详情数据 (含在川物化统计), 无额外请求
function buildUniCompareRows(list: UniversityListItem[], examType: '物理' | '历史') {
  const rows: Array<[string, (u: UniversityListItem) => any]> = [
    ['标签', (u) => [u.is985 && '985', u.is211 && '211', u.isDoubleFirstClass && '双一流'].filter(Boolean).join(' / ') || '—'],
    ['类型', (u) => u.type],
    ['省市', (u) => (u.province && u.city && u.province !== u.city ? `${u.province} · ${u.city}` : u.province ?? u.city)],
    ['办学性质', (u) => u.runningNature],
    ['层次', (u) => u.level],
    ['软科排名', (u) => (u.softRanking != null ? `${u.softRankList ?? ''} #${u.softRanking}` : null)],
    [`${examType}类最低分`, (u) => u.latestAdmission?.minScore],
    [`${examType}类最低位次`, (u) => u.latestAdmission?.minRank?.toLocaleString()],
    ['预测最低位次', (u) => u.predictedMinRank?.toLocaleString()],
    ['在川计划', (u) => (u.scPlanCount != null ? `${u.scPlanCount} 人 · ${u.scGroupCount ?? '-'} 组` : null)],
    ['招生批次', (u) => u.scBatches],
    ['去年征集', (u) => (u.scSupplCount ? `${u.scSupplCount} 人（未录满）` : null)],
  ];
  return rows.map(([metric, fn]) => {
    const row: Record<string, any> = { metric };
    list.forEach((u, i) => {
      row[`v${i}`] = fn(u);
    });
    return row;
  });
}
