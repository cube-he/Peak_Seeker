'use client';

import { Card, Button, Popconfirm } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

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
      {/* Compact View (always visible) */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-dim/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-xs text-text-faint font-mono w-6 text-center flex-shrink-0">
            {item.order}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-text truncate">
              {item.universityName}
            </div>
            <div className="text-xs text-text-muted truncate">
              {item.majorName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.admissionProbability !== undefined && (
            <span
              className="text-sm font-medium"
              style={{ color: gradientColor }}
            >
              {item.admissionProbability}%
            </span>
          )}
          {onToggleExpand && (
            <span className="text-text-faint text-xs">
              {expanded ? <UpOutlined /> : <DownOutlined />}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-border-subtle">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-xs">
            {item.historicalMinScore !== undefined && (
              <div>
                <span className="text-text-faint">历年最低分: </span>
                <span className="text-text-secondary font-medium">
                  {item.historicalMinScore}
                </span>
              </div>
            )}
            {item.historicalMinRank !== undefined && (
              <div>
                <span className="text-text-faint">历年最低位次: </span>
                <span className="text-text-secondary font-medium">
                  {item.historicalMinRank}
                </span>
              </div>
            )}
          </div>

          {item.explanation && (
            <p className="text-xs text-text-muted mt-2 leading-relaxed bg-surface-dim rounded-lg p-2.5">
              {item.explanation}
            </p>
          )}

          {item.notes && (
            <p className="text-xs text-text-faint mt-1.5 italic">
              备注: {item.notes}
            </p>
          )}

          {!readOnly && onDelete && (
            <div className="flex justify-end mt-2 pt-2 border-t border-border-subtle">
              <Popconfirm
                title="确定删除此志愿项？"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  onDelete();
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={(e) => e.stopPropagation()}
                >
                  删除
                </Button>
              </Popconfirm>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
