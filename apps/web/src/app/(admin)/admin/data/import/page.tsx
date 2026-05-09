'use client';

import { useState } from 'react';
import { Alert, Button, Card, message, Progress, Steps, Table, Upload } from 'antd';
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';

const { Dragger } = Upload;

interface ValidationResult {
  totalRows: number;
  validRows: number;
  errors: { row: number; field: string; message: string }[];
  warnings: { row: number; field: string; message: string }[];
}

export default function DataImportPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const validateMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return adminApi.validateImportFile(formData);
    },
    onSuccess: (data) => {
      setValidationResult(data?.data);
      setCurrentStep(1);
    },
    onError: () => message.error('文件验证失败'),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return adminApi.importData(formData);
    },
    onSuccess: () => {
      setCurrentStep(2);
      setImportProgress(100);
      message.success('数据导入完成');
    },
    onError: () => message.error('导入失败'),
  });

  const reset = () => {
    setCurrentStep(0);
    setSelectedFile(null);
    setValidationResult(null);
    setImportProgress(0);
  };

  const handleUpload = (file: File) => {
    setSelectedFile(file);
    setImportProgress(20);
    validateMutation.mutate(file);
    return false;
  };

  const handleImport = () => {
    if (selectedFile) {
      setImportProgress(60);
      importMutation.mutate(selectedFile);
    }
  };

  const statItems = [
    ['总行数', validationResult?.totalRows ?? '--', 'text-text'],
    ['有效行', validationResult?.validRows ?? '--', 'text-safe'],
    ['错误', validationResult?.errors.length ?? '--', 'text-rush'],
    ['警告', validationResult?.warnings.length ?? '--', 'text-accent'],
  ];

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <header>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">Data Pipeline</p>
        <h1 className="font-serif text-3xl font-semibold text-text">数据导入</h1>
        <p className="mt-2 text-sm text-text-muted">
          导入招生计划、录取数据等结构化文件，当前支持 .xlsx、.xls、.csv。
        </p>
      </header>

      <section className="rounded-2xl bg-[#0f1419] px-6 py-5 text-white shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-xl text-accent-light">
              <DatabaseOutlined />
            </span>
            <div>
              <p className="font-serif text-lg font-semibold">导入任务台</p>
              <p className="mt-1 text-sm text-slate-400">
                先验证、再入库；发现错误时不会执行正式导入。
              </p>
            </div>
          </div>
          <Button icon={<ReloadOutlined />} onClick={reset}>
            重置流程
          </Button>
        </div>
      </section>

      <Card className="rounded-2xl shadow-card">
        <Steps
          current={currentStep}
          items={[
            { title: '上传文件' },
            { title: '验证数据' },
            { title: '导入完成' },
          ]}
        />
      </Card>

      {currentStep === 0 ? (
        <Card className="rounded-2xl shadow-card">
          <Dragger
            accept=".xlsx,.xls,.csv"
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={validateMutation.isPending}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined className="text-5xl text-primary" />
            </p>
            <p className="ant-upload-text text-text-secondary">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint text-text-muted">支持 .xlsx、.xls、.csv 格式</p>
          </Dragger>
          {validateMutation.isPending ? (
            <div className="mt-5 text-center">
              <Progress percent={50} status="active" />
              <p className="mt-2 text-sm text-text-muted">正在验证文件...</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {currentStep === 1 && validationResult ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statItems.map(([label, value, color]) => (
              <div key={label as string} className="rounded-2xl bg-surface px-5 py-4 text-center shadow-card">
                <p className={`font-serif text-3xl font-semibold ${color}`}>{value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[1.4px] text-text-muted">{label}</p>
              </div>
            ))}
          </div>

          {validationResult.errors.length > 0 ? (
            <Alert
              type="error"
              message={`发现 ${validationResult.errors.length} 个错误`}
              description="请修正以下错误后重新上传；有错误时不会执行正式导入。"
              showIcon
            />
          ) : (
            <Alert type="success" message="验证通过" description="文件结构和必填字段已通过验证，可以开始导入。" showIcon />
          )}

          {validationResult.errors.length > 0 ? (
            <Table
              size="small"
              dataSource={validationResult.errors.slice(0, 20)}
              rowKey={(_, index) => String(index)}
              pagination={false}
              className="rounded-2xl bg-surface shadow-card"
              columns={[
                { title: '行号', dataIndex: 'row', width: 80 },
                { title: '字段', dataIndex: 'field', width: 140 },
                { title: '错误', dataIndex: 'message' },
              ]}
            />
          ) : null}

          <div className="flex justify-end gap-3">
            <Button onClick={reset}>重新上传</Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleImport}
              disabled={validationResult.errors.length > 0}
              loading={importMutation.isPending}
              className="border-0"
            >
              开始导入 ({validationResult.validRows} 行)
            </Button>
          </div>
          {importMutation.isPending ? <Progress percent={importProgress} status="active" /> : null}
        </div>
      ) : null}

      {currentStep === 2 ? (
        <Card className="rounded-2xl py-8 text-center shadow-card">
          <CheckCircleOutlined className="text-5xl text-safe" />
          <h2 className="mt-4 font-serif text-2xl font-semibold text-text">导入完成</h2>
          <p className="mt-2 text-sm text-text-muted">
            成功导入 {validationResult?.validRows || 0} 条数据。
          </p>
          <Button type="primary" className="mt-6 border-0" onClick={reset}>
            继续导入
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
