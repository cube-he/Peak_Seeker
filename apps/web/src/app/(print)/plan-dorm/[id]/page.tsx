'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { planApi } from '@/services/plan-api';
import DormInfoSheet from './DormInfoSheet';
import { buildDormTitle } from './export-filename';
import type { DormSheet } from './types';

const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
}
`;

export default function PlanDormPrintPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['plan-dorm-sheet', params.id],
    queryFn: () => planApi.getDormSheet(params.id) as Promise<DormSheet>,
    enabled: !!params.id,
  });

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = buildDormTitle(data);
    return () => {
      document.title = prev;
    };
  }, [data]);

  return (
    <div style={{ padding: 16, background: '#fff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          打印 / 另存为 PDF（A4 竖版）
        </Button>
        <span style={{ fontSize: 12, color: '#6b6962' }}>
          打印对话框里选 A4、纵向；可直接「另存为 PDF」发学生。
        </span>
      </div>

      {isLoading ? (
        <Spin />
      ) : isError ? (
        <Empty description="加载失败，请确认已登录且有权访问该方案" />
      ) : !data || data.universities.length === 0 ? (
        <Empty description="该方案暂无院校" />
      ) : (
        <DormInfoSheet sheet={data} />
      )}
    </div>
  );
}
