'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Radio,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  planImportApi,
  type PreviewGroup,
  type PreviewResponse,
} from '@/services/plan-import-api';

const { Title, Text } = Typography;
const EXAM_TYPE_CN: Record<string, string> = { PHYSICS: '物理类', HISTORY: '历史类' };

// useSearchParams 需要 Suspense 包裹才能通过 Next.js 静态预渲染 (CSR bailout)。
// 把"读 query"的部分放进 Inner,默认导出做 Suspense 边界。
export default function PlanImportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>加载中…</div>}>
      <PlanImportPageInner />
    </Suspense>
  );
}

function PlanImportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetStudentId = Number(searchParams.get('studentId')) || undefined;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | undefined>(undefined);

  const previewMutation = useMutation({
    mutationFn: (f: File) => planImportApi.preview(f, presetStudentId),
    onSuccess: (data) => {
      setPreview(data);
      // 预选:① query 的 studentId 在候选里 ② 候选只有 1 个
      const candidateIds = data.candidateStudents.map((s) => s.id);
      if (presetStudentId && candidateIds.includes(presetStudentId)) {
        setSelectedStudentId(presetStudentId);
      } else if (candidateIds.length === 1) {
        setSelectedStudentId(candidateIds[0]);
      } else {
        setSelectedStudentId(undefined);
      }
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || e?.message || '解析志愿表失败');
      setFile(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (payload: { studentId: number; batchConfigId: number; resolvedGroups: PreviewGroup[]; versionNote?: string }) =>
      planImportApi.commit(payload),
    onSuccess: (data) => {
      void message.success(`已导入 ${data.importedCount} 条志愿到 v${data.versionNo}`);
      router.push(`/teacher/plans/${data.planId}`);
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || e?.message || '导入失败');
    },
  });

  const uploadProps: UploadProps = {
    accept: '.pdf,application/pdf',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (f) => {
      setFile(f);
      setPreview(null);
      setSelectedStudentId(undefined);
      previewMutation.mutate(f);
      return false;
    },
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSelectedStudentId(undefined);
  };

  const canCommit = useMemo(() => {
    if (!preview) return false;
    if (!preview.batchConfig) return false;
    if (!selectedStudentId) return false;
    if (preview.summary.matched === 0) return false;
    return true;
  }, [preview, selectedStudentId]);

  const handleCommit = () => {
    if (!preview || !preview.batchConfig || !selectedStudentId) return;
    commitMutation.mutate({
      studentId: selectedStudentId,
      batchConfigId: preview.batchConfig.id,
      resolvedGroups: preview.groups,
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: '0 16px' }}>
      <Title level={3}>导入志愿表</Title>
      <Text type="secondary">
        上传学生真实填报的志愿表 PDF,系统会自动识别学生与批次、解析每条志愿,经你确认后在原方案上派生新版本(实填版)。
      </Text>

      <Card style={{ marginTop: 16 }}>
        {!file || !preview ? (
          <Upload.Dragger {...uploadProps} disabled={previewMutation.isPending}>
            <p className="ant-upload-drag-icon">📄</p>
            <p className="ant-upload-text">点击或拖拽志愿表 PDF 到此区域上传</p>
            <p className="ant-upload-hint">仅支持单个 PDF;解析在本地完成不留缓存</p>
            {previewMutation.isPending && <Text type="secondary">正在解析中…</Text>}
          </Upload.Dragger>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Space>
              <Text strong>已解析:</Text>
              <Text>{file.name}</Text>
              <Button size="small" onClick={reset}>重新选择</Button>
            </Space>

            <Descriptions title="识别身份" column={2} bordered size="small">
              <Descriptions.Item label="姓名">{preview.identity.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="班级">{preview.identity.classInfo || '—'}</Descriptions.Item>
              <Descriptions.Item label="考生号">{preview.identity.examNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="证件号">{preview.identity.idMasked || '—'}</Descriptions.Item>
              <Descriptions.Item label="批次(原始)">{preview.batch}</Descriptions.Item>
              <Descriptions.Item label="科类">{EXAM_TYPE_CN[preview.examTypeHint] || preview.examTypeHint}</Descriptions.Item>
            </Descriptions>

            {!preview.batchConfig && (
              <Alert
                type="error"
                showIcon
                message="该批次未配置"
                description={`系统里没有匹配「${preview.batch}」的批次配置,无法导入。请先在批次配置里建好对应批次。`}
              />
            )}
            {preview.batchConfig && (
              <Alert
                type="info"
                showIcon
                message={`批次已匹配: ${preview.batchConfig.batch} (#${preview.batchConfig.id})`}
              />
            )}

            <div>
              <Text strong>认人(请确认学生)</Text>
              {preview.candidateStudents.length === 0 ? (
                <Alert
                  style={{ marginTop: 8 }}
                  type="error"
                  showIcon
                  message="未在你名下找到对应学生"
                  description={`没有找到姓名为「${preview.identity.name || '?'}」的学生。请先在学生页新建,再回来导入。`}
                />
              ) : (
                <Radio.Group
                  style={{ marginTop: 8, display: 'block' }}
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                >
                  <Space direction="vertical">
                    {preview.candidateStudents.map((s) => (
                      <Radio key={s.id} value={s.id}>
                        {s.realName || '(无姓名)'} <Text type="secondary">#{s.id}</Text>
                        {s.classInfo ? <Text type="secondary"> · {s.classInfo}</Text> : null}
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
              )}
            </div>

            <div>
              <Space style={{ marginBottom: 8 }}>
                <Text strong>解析结果</Text>
                <Alert
                  type={preview.summary.unmatched === 0 ? 'success' : 'warning'}
                  showIcon
                  message={`共 ${preview.summary.total} 条,命中 ${preview.summary.matched} / 未命中 ${preview.summary.unmatched}`}
                />
              </Space>
              <Table
                size="small"
                rowKey="seq"
                pagination={false}
                dataSource={preview.groups}
                columns={[
                  { title: '顺位', dataIndex: 'seq', width: 60 },
                  { title: '院校码', dataIndex: 'schoolCode', width: 80 },
                  { title: '院校', dataIndex: 'schoolName' },
                  { title: '组', dataIndex: 'groupCode', width: 60 },
                  {
                    title: '状态', dataIndex: 'status', width: 100,
                    render: (s: string, r: PreviewGroup) =>
                      s === 'matched'
                        ? <Text style={{ color: '#16a34a' }}>{r.note ? `命中·${r.note}` : '✓ 命中'}</Text>
                        : <Text style={{ color: '#dc2626' }}>✗ {r.unmatchedReason || '未命中'}</Text>,
                  },
                  {
                    title: '专业',
                    render: (_: any, r: PreviewGroup) =>
                      r.selectedMajors.length > 0
                        ? <Text type="secondary">{r.selectedMajors.map((m) => m.majorName).join('、')}</Text>
                        : <Text type="secondary">—</Text>,
                  },
                  {
                    title: '服从', dataIndex: 'acceptAdjust', width: 60,
                    render: (b: boolean) => (b ? '是' : '否'),
                  },
                ]}
              />
            </div>

            <Space>
              <Button onClick={reset}>取消</Button>
              <Button
                type="primary"
                disabled={!canCommit}
                loading={commitMutation.isPending}
                onClick={handleCommit}
              >
                确认导入 ({preview.summary.matched} 条)
              </Button>
            </Space>
          </Space>
        )}
      </Card>
    </div>
  );
}
