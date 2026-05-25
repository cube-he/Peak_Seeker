'use client';

import { Tabs } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { RankingBoardTab } from './components/RankingBoardTab';
import { UniversityListTab } from './components/UniversityListTab';

export default function UniversitiesPage() {
  return (
    <MainLayout>
      <div className="pb-12">
        <Tabs
          defaultActiveKey="ranking"
          items={[
            { key: 'ranking', label: '排行导览', children: <RankingBoardTab /> },
            { key: 'all', label: '全部院校', children: <UniversityListTab /> },
          ]}
        />
      </div>
    </MainLayout>
  );
}
