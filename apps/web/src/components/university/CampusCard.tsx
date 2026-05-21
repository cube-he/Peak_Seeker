'use client';

import { Card, Descriptions } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

interface Props {
  militaryTrainingDuration: string | null;
}

const has = (v: any) => v != null && v !== '';

export default function CampusCard(p: Props) {
  const items: { label: string; value: any }[] = [];
  if (has(p.militaryTrainingDuration))
    items.push({ label: '军训时长', value: p.militaryTrainingDuration });

  if (items.length === 0) return null;

  return (
    <Card title={<><EnvironmentOutlined className="mr-1" />校园生活</>} size="small">
      <Descriptions column={1} size="small">
        {items.map((it) => (
          <Descriptions.Item key={it.label} label={it.label}>
            {it.value}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}
