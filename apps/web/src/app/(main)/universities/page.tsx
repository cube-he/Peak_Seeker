'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { RankingBoardTab } from './components/RankingBoardTab';
import { UniversityListTab } from './components/UniversityListTab';
import { MapTab } from './components/MapTab';
import { TrophyIcon, ListIcon, MapIcon, TrendIcon } from './components/shared/Icon';
import { useWorkbench } from '@/stores/workbenchStore';
import './styles.css';

/**
 * 院校库主页。设计稿:
 * - page-shell max-width 1500px + 32px padding(MainLayout maxWidth='1500px' 提供)
 * - 自定义 .lib-tabs 替代 antd Tabs(下划线 + 图标 + 角标 + NEW 标签)
 * - 4 个 tab:排行导览 / 全部院校 / 地图 / 志愿星图。后者本轮延后,disabled。
 */

type TabKey = 'ranking' | 'list' | 'map' | 'experimental';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof TrophyIcon; count?: string; isNew?: boolean; disabled?: boolean }> = [
  { key: 'ranking', label: '排行导览', Icon: TrophyIcon, count: '25' },
  { key: 'list', label: '全部院校', Icon: ListIcon, count: '2,237' },
  { key: 'map', label: '地图', Icon: MapIcon },
  { key: 'experimental', label: '志愿星图', Icon: TrendIcon, isNew: true },
];

function UniversitiesPageInner() {
  // 从学生详情/专业库带 ?studentId= 进入时: 写入共享工作台上下文并直达列表 tab
  const searchParams = useSearchParams();
  const setStudentId = useWorkbench((s) => s.setStudentId);
  const [tab, setTab] = useState<TabKey>(() => (searchParams.get('studentId') ? 'list' : 'ranking'));
  useEffect(() => {
    const sid = searchParams.get('studentId');
    if (sid) setStudentId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MainLayout maxWidth="1500px">
      <div className="pb-12">
        <div className="lib-tabs">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`lib-tab ${active ? 'is-active' : ''}`}
                onClick={() => !t.disabled && setTab(t.key)}
                disabled={t.disabled}
                style={t.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                title={t.disabled ? '即将上线' : undefined}
              >
                <t.Icon />
                {t.label}
                {t.count && <span className="count">{t.count}</span>}
                {t.isNew && <span className="new-pill">NEW</span>}
              </button>
            );
          })}
        </div>

        <div key={tab} className="view-transition">
          {tab === 'ranking' && <RankingBoardTab />}
          {tab === 'list' && <UniversityListTab />}
          {tab === 'map' && <MapTab />}
          {tab === 'experimental' && <ExperimentalPlaceholder />}
        </div>
      </div>
    </MainLayout>
  );
}

// 志愿星图预告占位: 不再 disabled 挂着, 点进来有交代
function ExperimentalPlaceholder() {
  return (
    <div
      className="card"
      style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>
        志愿星图 · 即将上线
      </div>
      <p style={{ margin: 0, fontSize: 13 }}>
        以学生位次为中心，把可冲 / 可稳 / 可保的院校铺成一张星图，直观看到志愿梯度的分布。
      </p>
    </div>
  );
}

// useSearchParams 在静态预渲染页面要求 Suspense 边界 (Next 14 CSR bailout)
export default function UniversitiesPage() {
  return (
    <Suspense fallback={null}>
      <UniversitiesPageInner />
    </Suspense>
  );
}
