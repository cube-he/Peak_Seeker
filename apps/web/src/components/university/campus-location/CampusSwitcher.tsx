// apps/web/src/components/university/campus-location/CampusSwitcher.tsx
'use client';

import { Segmented } from 'antd';
import type { Campus } from './types';

interface CampusSwitcherProps {
  campuses: Campus[];
  selectedCampusId: number;
  onChange: (id: number) => void;
}

/**
 * 多校区切换器。campuses.length <= 1 时不渲染(单校区学校用不上)。
 * 用 antd Segmented 做分段控件,匹配项目现有 UI 风格。
 * 主校区在标签里加「主」字小标记,跟地图上的蓝/绿 pin 视觉对应。
 */
export function CampusSwitcher({ campuses, selectedCampusId, onChange }: CampusSwitcherProps) {
  if (campuses.length <= 1) return null;

  const options = campuses.map((c) => ({
    label: (
      <span>
        {c.name}
        {c.isMain && (
          <span
            style={{
              marginLeft: 4,
              padding: '0 4px',
              fontSize: 10,
              fontWeight: 500,
              color: '#2563eb',
              background: 'rgba(37,99,235,0.1)',
              borderRadius: 3,
            }}
          >
            主
          </span>
        )}
      </span>
    ),
    value: c.id,
  }));

  return (
    <div className="mb-3">
      <Segmented
        options={options}
        value={selectedCampusId}
        onChange={(v) => onChange(Number(v))}
        block
      />
    </div>
  );
}

export default CampusSwitcher;
