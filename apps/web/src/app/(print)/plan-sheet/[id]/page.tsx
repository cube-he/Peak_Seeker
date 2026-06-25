'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { planApi } from '@/services/plan-api';
import ParentExplainTable from './ParentExplainTable';
import type { ExportSheet } from './types';

// @page 必须是全局 at-rule(CSS Module 不 scope 它), 故直接注入 <style>。
const PRINT_CSS = `
@page { size: A3 landscape; margin: 8mm; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; }
}
`;

export default function PlanSheetPrintPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['plan-export-rows', params.id],
    queryFn: () => planApi.getExportRows(params.id) as Promise<ExportSheet>,
    enabled: !!params.id,
  });

  return (
    <div style={{ padding: 16, background: '#fff', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
          打印 / 另存为 PDF（A3 横版）
        </Button>
        <span style={{ fontSize: 12, color: '#6b6962' }}>
          打印对话框里选 A3、横向；可直接「另存为 PDF」发家长。
        </span>
      </div>

      {isLoading ? (
        <Spin />
      ) : isError ? (
        <Empty description="加载失败，请确认已登录且有权访问该方案" />
      ) : !data || data.groups.length === 0 ? (
        <Empty description="该方案暂无志愿" />
      ) : (
        <ParentExplainTable sheet={data} />
      )}
    </div>
  );
}
