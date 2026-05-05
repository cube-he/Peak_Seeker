'use client';

import { Card, Collapse } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

interface Props {
  renameHistory: string | null;
  admissionGuide: string | null;
  charterInfo: any;
}

const has = (v: any) => v != null && v !== '';

export default function CharterCard(p: Props) {
  const items: any[] = [];

  if (has(p.renameHistory)) {
    items.push({
      key: 'rename',
      label: '更名历史',
      children: <div className="whitespace-pre-wrap text-[13px] leading-6">{p.renameHistory}</div>,
    });
  }

  if (has(p.admissionGuide)) {
    items.push({
      key: 'guide',
      label: '招生章程',
      children: (
        <div className="max-h-[400px] overflow-auto whitespace-pre-wrap text-[13px] leading-6">
          {p.admissionGuide}
        </div>
      ),
    });
  }

  // charterInfo 是 JSON：当对象时按 key 展平为段落；当字符串时直接显示
  let charterRendered: React.ReactNode = null;
  if (p.charterInfo && typeof p.charterInfo === 'object' && !Array.isArray(p.charterInfo)) {
    const entries = Object.entries(p.charterInfo).filter(([, v]) => v != null && v !== '');
    if (entries.length > 0) {
      charterRendered = (
        <div className="space-y-3 text-[13px]">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="text-text-tertiary mb-1">{k}</div>
              <div className="leading-6 whitespace-pre-wrap">{String(v)}</div>
            </div>
          ))}
        </div>
      );
    }
  } else if (typeof p.charterInfo === 'string' && p.charterInfo) {
    charterRendered = (
      <div className="whitespace-pre-wrap text-[13px] leading-6">{p.charterInfo}</div>
    );
  }
  if (charterRendered) {
    items.push({ key: 'charter', label: '章程详情', children: charterRendered });
  }

  if (items.length === 0) return null;

  return (
    <Card title={<><FileTextOutlined className="mr-1" />招生章程</>} size="small">
      <Collapse ghost size="small" items={items} />
    </Card>
  );
}
