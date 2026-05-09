'use client';

import { Button, Card, Popconfirm } from 'antd';
import { DeleteOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import ProspectRow from './ProspectRow';

interface PlanItem {
  id: number;
  order: number;
  universityName: string;
  majorName: string;
  admissionProbability?: number;
  gradient: string;
  historicalMinScore?: number;
  historicalMinRank?: number;
  notes?: string;
  explanation?: string;
  scoreBreakdown?: any;
}

interface PlanItemCardProps {
  item: PlanItem;
  gradientColor: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

export default function PlanItemCard({
  item,
  gradientColor,
  expanded = false,
  onToggleExpand,
  onDelete,
  readOnly = false,
}: PlanItemCardProps) {
  return (
    <Card
      size="small"
      className="overflow-hidden"
      bodyStyle={{ padding: 0 }}
      style={{ borderLeft: `3px solid ${gradientColor}` }}
    >
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-surface-dim/50"
        onClick={onToggleExpand}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-6 flex-shrink-0 text-center font-mono text-xs text-text-faint">{item.order}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text">{item.universityName}</div>
            <div className="truncate text-xs text-text-muted">{item.majorName}</div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {item.admissionProbability !== undefined ? (
            <span className="text-sm font-medium" style={{ color: gradientColor }}>
              {item.admissionProbability}%
            </span>
          ) : null}
          {onToggleExpand ? (
            <span className="text-xs text-text-faint">{expanded ? <UpOutlined /> : <DownOutlined />}</span>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-border-subtle px-4 pb-3 pt-0">
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {item.historicalMinScore !== undefined ? (
              <div>
                <span className="text-text-faint">历年最低分: </span>
                <span className="font-medium text-text-secondary">{item.historicalMinScore}</span>
              </div>
            ) : null}
            {item.historicalMinRank !== undefined ? (
              <div>
                <span className="text-text-faint">历年最低位次: </span>
                <span className="font-medium text-text-secondary">{item.historicalMinRank}</span>
              </div>
            ) : null}
          </div>

          {item.explanation ? (
            <p className="mt-2 rounded-lg bg-surface-dim p-2.5 text-xs leading-relaxed text-text-muted">
              {item.explanation}
            </p>
          ) : null}

          {item.notes ? <p className="mt-1.5 text-xs italic text-text-faint">备注: {item.notes}</p> : null}

          <ProspectRow scoreBreakdown={item.scoreBreakdown} />

          {!readOnly && onDelete ? (
            <div className="mt-2 flex justify-end border-t border-border-subtle pt-2">
              <Popconfirm
                title="确定删除此志愿项？"
                onConfirm={(event) => {
                  event?.stopPropagation();
                  onDelete();
                }}
              >
                <Button type="text" size="small" icon={<DeleteOutlined />} danger onClick={(event) => event.stopPropagation()}>
                  删除
                </Button>
              </Popconfirm>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
