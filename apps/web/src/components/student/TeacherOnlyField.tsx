'use client';

import { Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';

interface Props {
  label: string;
  value: string | number | null | undefined;
}

/**
 * ① TEACHER_ONLY_FIELDS 在学生端的只读展示。
 * 数据为 null/undefined 时显示「未录入」。
 */
export default function TeacherOnlyField({ label, value }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0">
      <Tooltip title="此字段由老师录入">
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <LockOutlined /> {label}
        </span>
      </Tooltip>
      <span className="font-mono text-sm text-text">
        {value !== null && value !== undefined && value !== '' ? (
          value
        ) : (
          <span className="text-text-faint">未录入</span>
        )}
      </span>
    </div>
  );
}
