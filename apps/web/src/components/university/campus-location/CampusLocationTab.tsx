// apps/web/src/components/university/campus-location/CampusLocationTab.tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { EnvironmentOutlined } from '@ant-design/icons';
import { CampusPanel } from './CampusPanel';
import { CampusSwitcher } from './CampusSwitcher';
import type { Campus } from './types';

// CampusMap touches the AMap browser SDK; never SSR it.
const CampusMap = dynamic(() => import('./CampusMap').then((m) => m.CampusMap), {
  ssr: false,
  loading: () => (
    <div className="bg-surface-dim rounded-lg" style={{ height: 480 }} />
  ),
});

interface CampusLocationTabProps {
  universityId: number;
  campuses: Campus[];
}

export function CampusLocationTab({ universityId, campuses }: CampusLocationTabProps) {
  // 2026-06-02:把 Stage 1 的"固定主校区"解除,加上切换器(antd Segmented)。
  // 切换器在多校区时显示;切换时 panel 跟着换,地图保持全校区视野(用户已经能
  // 通过 marker 颜色区分主/副,不需要地图也跟着 pan,避免视野跳来跳去)。
  const initialMain = campuses.find((c) => c.isMain) ?? campuses[0];
  const [selectedCampusId, setSelectedCampusId] = useState<number>(initialMain.id);

  const selected = campuses.find((c) => c.id === selectedCampusId) ?? initialMain;

  return (
    <div className="bg-surface rounded-xl shadow-card p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <EnvironmentOutlined className="text-primary" />
        <h3 className="font-serif text-base font-semibold text-text m-0">
          校区位置 {campuses.length > 1 ? `(${campuses.length} 个校区)` : ''}
        </h3>
      </div>
      <CampusSwitcher
        campuses={campuses}
        selectedCampusId={selectedCampusId}
        onChange={setSelectedCampusId}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CampusMap
            campuses={campuses}
            onSelectCampus={setSelectedCampusId}
          />
        </div>
        <div className="lg:col-span-1">
          <CampusPanel universityId={universityId} selectedCampus={selected} />
        </div>
      </div>
    </div>
  );
}

export default CampusLocationTab;
