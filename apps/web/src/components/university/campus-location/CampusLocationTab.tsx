// apps/web/src/components/university/campus-location/CampusLocationTab.tsx
'use client';

import { useState } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';
import { CampusMap } from './CampusMap';
import { CampusPanel } from './CampusPanel';
import type { Campus } from './types';

interface CampusLocationTabProps {
  universityId: number;
  campuses: Campus[];
}

export function CampusLocationTab({ universityId, campuses }: CampusLocationTabProps) {
  // Stage 1: selection is fixed to the main campus (no switcher yet).
  // Stage 2 will pass setSelectedId down to CampusSwitcher.
  const initialMain = campuses.find((c) => c.isMain) ?? campuses[0];
  const [selectedCampusId] = useState<number>(initialMain.id);

  const selected = campuses.find((c) => c.id === selectedCampusId) ?? initialMain;

  return (
    <div className="bg-surface rounded-xl shadow-card p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <EnvironmentOutlined className="text-primary" />
        <h3 className="font-serif text-base font-semibold text-text m-0">
          校区位置 {campuses.length > 1 ? `(${campuses.length} 个校区)` : ''}
        </h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CampusMap campuses={campuses} selectedCampusId={selectedCampusId} />
        </div>
        <div className="lg:col-span-1">
          <CampusPanel universityId={universityId} selectedCampus={selected} />
        </div>
      </div>
    </div>
  );
}

export default CampusLocationTab;
