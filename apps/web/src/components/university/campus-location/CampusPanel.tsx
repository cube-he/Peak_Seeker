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
      <div className="space-y-3">
        <PoiList universityId={universityId} campusId={selectedCampus.id} category="subway" />
        <PoiList universityId={universityId} campusId={selectedCampus.id} category="mall" />
        <PoiList universityId={universityId} campusId={selectedCampus.id} category="airport" />
      </div>
    </div>
  );
}

export default CampusPanel;
