'use client';

import { useState } from 'react';
import {
  Card,
  Upload,
  Button,
  Alert,
  Progress,
  Table,
  message,
  Steps,
} from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
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
  const [, setImportProgress] = useState(0);

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

  const handleUpload = (file: File) => {
    setSelectedFile(file);
    validateMutation.mutate(file);
    return false; // Prevent auto upload
  };

  const handleImport = () => {
    if (selectedFile) {
      setImportProgress(30);
      importMutation.mutate(selectedFile);
    }
  };

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-xl font-semibold text-text">数据导入</h1>
        <p className="text-sm text-text-muted mt-1">导入招生计划、录取数据等</p>
      </div>

      <Steps
        current={currentStep}
        items={[
          { title: '上传文件' },
          { title: '验证数据' },
          { title: '导入完成' },
        ]}
        className="mb-6"
      />

      {/* Step 0: Upload */}
      {currentStep === 0 && (
        <Card>
          <Dragger
            accept=".xlsx,.xls,.csv"
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={validateMutation.isPending}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined className="text-4xl text-primary" />
            </p>
            <p className="ant-upload-text text-text-secondary">
              点击或拖拽文件到此区域上传
            </p>
            <p className="ant-upload-hint text-text-muted">
              支持 .xlsx, .xls, .csv 格式
            </p>
          </Dragger>
          {validateMutation.isPending && (
            <div className="mt-4 text-center">
              <Progress percent={50} status="active" />
              <p className="text-sm text-text-muted mt-2">正在验证文件...</p>
            </div>
          )}
        </Card>
      )}

      {/* Step 1: Validation Report */}
      {currentStep === 1 && validationResult && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <div className="text-2xl font-serif font-semibold text-text">
                  {validationResult.totalRows}
                </div>
                <div className="text-xs text-text-muted">总行数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-serif font-semibold text-safe">
                  {validationResult.validRows}
                </div>
                <div className="text-xs text-text-muted">有效行</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-serif font-semibold text-rush">
                  {validationResult.errors.length}
                </div>
                <div className="text-xs text-text-muted">错误</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-serif font-semibold text-accent">
                  {validationResult.warnings.length}
                </div>
                <div className="text-xs text-text-muted">警告</div>
              </div>
            </div>

            {validationResult.errors.length > 0 && (
              <Alert
                type="error"
                message={`发现 ${validationResult.errors.length} 个错误`}
                description="请修正以下错误后重新上传"
                showIcon
                className="mb-4"
              />
            )}

            {validationResult.errors.length > 0 && (
              <Table
                size="small"
                dataSource={validationResult.errors.slice(0, 20)}
                rowKey={(_, i) => String(i)}
                pagination={false}
                columns={[
                  { title: '行号', dataIndex: 'row', width: 80 },
                  { title: '字段', dataIndex: 'field', width: 120 },
                  { title: '错误', dataIndex: 'message' },
                ]}
              />
            )}
          </Card>

          <div className="flex gap-3 justify-end">
            <Button onClick={() => { setCurrentStep(0); setSelectedFile(null); setValidationResult(null); }}>
              重新上传
            </Button>
            <Button
              type="primary"
              onClick={handleImport}
              disabled={validationResult.errors.length > 0}
              loading={importMutation.isPending}
            >
              开始导入 ({validationResult.validRows} 行)
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Import Complete */}
      {currentStep === 2 && (
        <Card className="text-center py-8">
          <CheckCircleOutlined className="text-5xl text-safe" />
          <h2 className="font-serif text-xl font-semibold text-text mt-4">
            导入完成
          </h2>
          <p className="text-sm text-text-muted mt-2">
            成功导入 {validationResult?.validRows || 0} 条数据
          </p>
          <Button
            type="primary"
            className="mt-6"
            onClick={() => {
              setCurrentStep(0);
              setSelectedFile(null);
              setValidationResult(null);
            }}
          >
            继续导入
          </Button>
        </Card>
      )}
    </div>
  );
}
