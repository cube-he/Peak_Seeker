'use client';

import { useState } from 'react';
import { Button, Empty, Tabs } from 'antd';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { ExpandableAdmissionRow } from './ExpandableAdmissionRow';

const PAGE_SIZE = 10;

export interface TieredBuckets {
  rush: AggregatedAdmissionListItem[];
  stable: AggregatedAdmissionListItem[];
  safe: AggregatedAdmissionListItem[];
}

interface TieredResultsProps {
  userRank: number;
  buckets: TieredBuckets;
}

interface TierPanelProps {
  userRank: number;
  items: AggregatedAdmissionListItem[];
  emptyText: string;
}

function itemKey(item: AggregatedAdmissionListItem): string {
  return [
    item.university.id,
    item.majorCode,
    item.groupCode,
    item.batch,
    item.recruitType,
    item.subjects,
  ].join(':');
}

function TierPanel({ userRank, items, emptyText }: TierPanelProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  if (items.length === 0) {
    return <Empty description={emptyText} />;
  }

  return (
    <div>
      {items.slice(0, visible).map((item) => (
        <ExpandableAdmissionRow key={itemKey(item)} item={item} userRank={userRank} />
      ))}
      {visible < items.length ? (
        <Button block onClick={() => setVisible((current) => current + PAGE_SIZE)}>
          加载更多
        </Button>
      ) : null}
    </div>
  );
}

export function TieredResults({ userRank, buckets }: TieredResultsProps) {
  return (
    <Tabs
      defaultActiveKey="stable"
      items={[
        {
          key: 'rush',
          label: `冲 (${buckets.rush.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.rush} emptyText="暂无可冲院校" />
          ),
        },
        {
          key: 'stable',
          label: `稳 (${buckets.stable.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.stable} emptyText="暂无较稳院校" />
          ),
        },
        {
          key: 'safe',
          label: `保 (${buckets.safe.length})`,
          children: (
            <TierPanel userRank={userRank} items={buckets.safe} emptyText="暂无保底院校" />
          ),
        },
      ]}
    />
  );
}
