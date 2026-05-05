// apps/web/src/components/university/campus-location/CampusPanel.tsx
'use client';

import { CampusInfo } from './CampusInfo';
import { PoiList } from './PoiList';
import type { Campus } from './types';

interface CampusPanelProps {
  universityId: number;
  selectedCampus: Campus;
}

export function CampusPanel({ universityId, selectedCampus }: CampusPanelProps) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <CampusInfo campus={selectedCampus} />
      <PoiList
        universityId={universityId}
        campusId={selectedCampus.id}
        category="subway"
      />
    </div>
  );
}

export default CampusPanel;
