'use client';

import { Tabs } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { RankingBoardTab } from './components/RankingBoardTab';
import { UniversityListTab } from './components/UniversityListTab';
import { MapTab } from './components/MapTab';

export default function UniversitiesPage() {
  // 地图 tab 需要更宽的画布(默认 1200px 在 1920p 屏上两边留白太多),
  // 1500px 给地图更大占比的同时,list / ranking tab 内容也更舒展
  return (
    <MainLayout maxWidth="1500px">
      <div className="pb-12">
        <Tabs
          defaultActiveKey="ranking"
          items={[
            { key: 'ranking', label: '排行导览', children: <RankingBoardTab /> },
            { key: 'all', label: '全部院校', children: <UniversityListTab /> },
            { key: 'map', label: '地图', children: <MapTab /> },
          ]}
        />
      </div>
    </MainLayout>
  );
}
