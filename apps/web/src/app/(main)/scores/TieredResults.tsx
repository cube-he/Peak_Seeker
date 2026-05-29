'use client';

import { useMemo, useState } from 'react';
import { Button, Empty, Tabs } from 'antd';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';
import { ExpandableAdmissionRow } from './ExpandableAdmissionRow';
import {
  DEFAULT_SCORE_FILTERS,
  ScoreFilterBar,
  type ScoreFilters,
} from './ScoreFilterBar';

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

function applyFilters(
  items: AggregatedAdmissionListItem[],
  filters: ScoreFilters,
  userRank: number,
): AggregatedAdmissionListItem[] {
  let r = items;
  const s = filters.search.trim();
  if (s) {
    r = r.filter((x) => x.university.name.includes(s));
  }
  if (filters.tags.length > 0) {
    r = r.filter((x) =>
      filters.tags.some(
        (t) =>
          (t === '985' && x.university.is985) ||
          (t === '211' && x.university.is211) ||
          (t === '双一流' && x.university.isDoubleFirstClass),
      ),
    );
  }
  if (filters.scope === 'local') r = r.filter((x) => x.university.province === '四川');
  if (filters.scope === 'remote') r = r.filter((x) => x.university.province !== '四川');

  const sorted = [...r];
  switch (filters.sort) {
    case 'rankAsc':
      sorted.sort(
        (a, b) =>
          (a.predictedMinRank?.point ?? Infinity) - (b.predictedMinRank?.point ?? Infinity),
      );
      break;
    case 'rankDesc':
      sorted.sort(
        (a, b) =>
          (b.predictedMinRank?.point ?? -Infinity) -
          (a.predictedMinRank?.point ?? -Infinity),
      );
      break;
    case 'distance':
    default:
      sorted.sort((a, b) => {
        const ap = a.predictedMinRank?.point ?? Infinity;
        const bp = b.predictedMinRank?.point ?? Infinity;
        return Math.abs(ap - userRank) - Math.abs(bp - userRank);
      });
  }
  return sorted;
}

export function TieredResults({ userRank, buckets }: TieredResultsProps) {
  const [filters, setFilters] = useState<ScoreFilters>(DEFAULT_SCORE_FILTERS);

  const filteredBuckets = useMemo(
    () => ({
      rush: applyFilters(buckets.rush, filters, userRank),
      stable: applyFilters(buckets.stable, filters, userRank),
      safe: applyFilters(buckets.safe, filters, userRank),
    }),
    [buckets, filters, userRank],
  );

  // 优先「稳」, 没数据再退到「冲」或「保」. Tabs key 在 buckets 变化时重 mount,
  // 让 defaultActiveKey 重新生效 (清理 TierPanel 的"加载更多"状态, 符合预期).
  const initialKey =
    filteredBuckets.stable.length > 0
      ? 'stable'
      : filteredBuckets.rush.length > 0
        ? 'rush'
        : 'safe';
  const tabsKey = `${filteredBuckets.rush.length}-${filteredBuckets.stable.length}-${filteredBuckets.safe.length}`;

  return (
    <div className="space-y-3">
      <ScoreFilterBar value={filters} onChange={setFilters} />
      <Tabs
        key={tabsKey}
        defaultActiveKey={initialKey}
        items={[
          {
            key: 'rush',
            label: `冲 (${filteredBuckets.rush.length})`,
            children: (
              <TierPanel
                userRank={userRank}
                items={filteredBuckets.rush}
                emptyText="暂无可冲院校"
              />
            ),
          },
          {
            key: 'stable',
            label: `稳 (${filteredBuckets.stable.length})`,
            children: (
              <TierPanel
                userRank={userRank}
                items={filteredBuckets.stable}
                emptyText="暂无较稳院校"
              />
            ),
          },
          {
            key: 'safe',
            label: `保 (${filteredBuckets.safe.length})`,
            children: (
              <TierPanel
                userRank={userRank}
                items={filteredBuckets.safe}
                emptyText="暂无保底院校"
              />
            ),
          },
        ]}
      />
    </div>
  );
}
