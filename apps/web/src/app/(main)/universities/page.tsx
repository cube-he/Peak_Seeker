'use client';

import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { RankingBoardTab } from './components/RankingBoardTab';
import { UniversityListTab } from './components/UniversityListTab';
import { MapTab } from './components/MapTab';
import { TrophyIcon, ListIcon, MapIcon, TrendIcon } from './components/shared/Icon';
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
  { key: 'experimental', label: '志愿星图', Icon: TrendIcon, isNew: true, disabled: true },
];

export default function UniversitiesPage() {
  const [tab, setTab] = useState<TabKey>('ranking');

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
        </div>
      </div>
    </MainLayout>
  );
}
