'use client';

import { useState } from 'react';
import { Form, InputNumber, Select, message } from 'antd';
import { BulbOutlined, SaveOutlined, ExportOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import StatusChip from '@/components/ui/StatusChip';
import { recommendService, RecommendPlanParams } from '@/services/recommend';
import { useUserStore } from '@/stores/userStore';
import { PROVINCES } from '@volunteer-helper/shared';

const { Option } = Select;

type Strategy = 'balanced' | 'aggressive' | 'conservative';

const strategyOptions: { value: Strategy; label: string; description: string }[] = [
  { value: 'balanced', label: '稳健增长', description: '均衡冲稳保比例，适合多数考生' },
  { value: 'aggressive', label: '激进冲击', description: '大幅增加冲刺院校，博取更高层次' },
  { value: 'conservative', label: '保守保底', description: '增加保底院校，确保录取无忧' },
];

const strategyPresets: Record<Strategy, { rush: number; stable: number; safe: number }> = {
  balanced: { rush: 20, stable: 40, safe: 36 },
  aggressive: { rush: 36, stable: 30, safe: 30 },
  conservative: { rush: 10, stable: 36, safe: 50 },
};

export default function RecommendPage() {
  const [form] = Form.useForm();
  const { examInfo, setExamInfo } = useUserStore();
  const [planResult, setPlanResult] = useState<any>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>('balanced');

  const generateMutation = useMutation({
    mutationFn: (params: RecommendPlanParams) =>
      recommendService.generatePlan(params),
    onSuccess: (data) => {
      setPlanResult(data);
      message.success('方案生成成功！');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || '生成失败，请稍后重试';
      message.error(msg);
    },
  });

  const handleGenerate = (values: any) => {
    setExamInfo({
      score: values.score,
      rank: values.rank,
      province: values.province,
    });
    generateMutation.mutate({
      score: values.score,
      rank: values.rank,
      province: values.province,
      preferences: { provinces: values.preferredProvinces },
      strategy: {
        rushCount: values.rushCount || 20,
        stableCount: values.stableCount || 40,
        safeCount: values.safeCount || 36,
      },
    });
  };

  const handleSavePlan = async () => {
    if (!planResult?.plan) return;
    try {
      // TODO: Call plan service to save
      message.success('方案保存成功！');
    } catch {
      message.error('保存失败，请稍后重试');
    }
  };

  const handleExportPlan = () => {
    if (!planResult?.plan?.items) return;

    const headers = ['序号', '策略', '院校', '专业', '去年最低分', '去年最低位次', '录取概率'];
    const strategyMap: Record<string, string> = { rush: '冲', stable: '稳', safe: '保' };
    const rows = planResult.plan.items.map((item: any) => [
      item.order,
      strategyMap[item.strategy] || item.strategy,
      item.university?.name || '',
      item.major?.name || '',
      item.admission?.minScore || '',
      item.admission?.minRank || '',
      `${Math.round((item.prediction?.acceptRate || 0) * 100)}%`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `志愿方案_${new Date().toLocaleDateString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('导出成功！');
  };

  const handleStrategyChange = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    const preset = strategyPresets[strategy];
    form.setFieldsValue({
      rushCount: preset.rush,
      stableCount: preset.stable,
      safeCount: preset.safe,
    });
  };

  const getAccentBorder = (strategy: string) => {
    switch (strategy) {
      case 'rush': return 'border-l-error';
      case 'stable': return 'border-l-primary';
      case 'safe': return 'border-l-secondary';
      default: return 'border-l-outline';
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent < 40) return 'bg-error';
    if (percent < 70) return 'bg-primary';
    return 'bg-secondary';
  };

  const getProgressTrack = (percent: number) => {
    if (percent < 40) return 'bg-error-container';
    if (percent < 70) return 'bg-primary-fixed';
    return 'bg-secondary-fixed';
  };

  const strategyLabel: Record<string, string> = { rush: '冲', stable: '稳', safe: '保' };
  const strategyVariant: Record<string, 'rush' | 'stable' | 'safe'> = {
    rush: 'rush',
    stable: 'stable',
    safe: 'safe',
  };

  return (
    <MainLayout>
      {/* Page Title */}
      <div className="mb-8">
        <h2 className="text-xl font-headline font-extrabold text-on-surface mb-1">智能推荐</h2>
        <p className="text-sm text-on-surface-variant">输入分数和位次，AI 智能生成冲稳保方案</p>
      </div>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Sidebar */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 sticky top-24">
          <div className="bg-surface-container-lowest rounded-xl p-6">
            <h3 className="text-base font-headline font-extrabold text-primary mb-5">AI 实验室参数</h3>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleGenerate}
              initialValues={{
                score: examInfo.score,
                rank: examInfo.rank,
                province: examInfo.province || '四川',
                rushCount: 20,
                stableCount: 40,
                safeCount: 36,
              }}
            >
              <Form.Item
                name="score"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">高考分数</span>}
                rules={[{ required: true, message: '请输入分数' }]}
              >
                <InputNumber min={0} max={750} className="w-full" placeholder="请输入高考分数" />
              </Form.Item>

              <Form.Item
                name="rank"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">省排名位次</span>}
                rules={[{ required: true, message: '请输入位次' }]}
              >
                <InputNumber min={1} className="w-full" placeholder="请输入省排名位次" />
              </Form.Item>

              <Form.Item
                name="province"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">所在省份</span>}
                rules={[{ required: true, message: '请选择省份' }]}
              >
                <Select placeholder="请选择省份">
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              {/* Strategy Selection */}
              <div className="mb-5">
                <span className="text-xs uppercase tracking-widest text-on-surface-variant font-label block mb-3">策略模式</span>
                <div className="flex flex-col gap-2">
                  {strategyOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleStrategyChange(opt.value)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-300 cursor-pointer ${
                        selectedStrategy === opt.value
                          ? 'border-primary bg-primary-fixed/30'
                          : 'border-surface-container-high bg-surface-container-high hover:border-outline-variant'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${selectedStrategy === opt.value ? 'text-primary' : 'text-on-surface'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Count Inputs */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Form.Item
                  name="rushCount"
                  label={<StatusChip variant="rush" size="sm">冲</StatusChip>}
                  className="mb-0"
                >
                  <InputNumber min={0} max={50} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="stableCount"
                  label={<StatusChip variant="stable" size="sm">稳</StatusChip>}
                  className="mb-0"
                >
                  <InputNumber min={0} max={60} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="safeCount"
                  label={<StatusChip variant="safe" size="sm">保</StatusChip>}
                  className="mb-0"
                >
                  <InputNumber min={0} max={50} className="w-full" />
                </Form.Item>
              </div>

              <Form.Item
                name="preferredProvinces"
                label={<span className="text-xs uppercase tracking-widest text-on-surface-variant font-label">偏好省份</span>}
              >
                <Select mode="multiple" placeholder="选择偏好省份（可多选）" maxTagCount={3}>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item className="mb-0">
                <button
                  type="submit"
                  disabled={generateMutation.isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-sm border-0 cursor-pointer flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-glow-primary-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <BulbOutlined />
                  {generateMutation.isPending ? '生成中...' : '✦ 生成志愿方案'}
                </button>
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          {planResult ? (
            <>
              {/* Header with completion badge */}
              <div className="flex items-center gap-3 mb-6">
                <h3 className="text-lg font-headline font-extrabold text-on-surface">智能分析报告</h3>
                <span className="bg-secondary-fixed text-secondary rounded-full text-xs font-semibold px-3 py-1">
                  已完成
                </span>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard
                  label="总推荐数"
                  value={planResult.statistics?.totalCount ?? '-'}
                  accentColor="primary"
                />
                <StatCard
                  label="冲刺院校"
                  value={planResult.statistics?.rushCount ?? '-'}
                  subtitle="冲"
                  accentColor="error"
                />
                <StatCard
                  label="稳妥院校"
                  value={planResult.statistics?.stableCount ?? '-'}
                  subtitle="稳"
                  accentColor="primary"
                />
                <StatCard
                  label="保底院校"
                  value={planResult.statistics?.safeCount ?? '-'}
                  subtitle="保"
                  accentColor="secondary"
                />
              </div>

              {/* Action Bar */}
              <div className="bg-surface-container-lowest rounded-xl mb-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-low">
                  <span className="font-headline font-semibold text-on-surface text-sm">
                    志愿方案 ({planResult.plan?.items?.length ?? 0} 条)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSavePlan}
                      className="h-8 px-4 rounded-lg bg-surface-container-high text-on-surface text-xs font-medium border-0 cursor-pointer flex items-center gap-1.5 transition-all duration-300 hover:bg-surface-container-highest"
                    >
                      <SaveOutlined />
                      保存方案
                    </button>
                    <button
                      onClick={handleExportPlan}
                      className="h-8 px-4 rounded-lg bg-surface-container-high text-on-surface text-xs font-medium border-0 cursor-pointer flex items-center gap-1.5 transition-all duration-300 hover:bg-surface-container-highest"
                    >
                      <ExportOutlined />
                      导出
                    </button>
                  </div>
                </div>

                {/* Recommendation Cards */}
                <div className="divide-y divide-surface-container-low">
                  {planResult.plan?.items?.map((item: any) => {
                    const rate = item.prediction?.acceptRate || 0;
                    const percent = Math.round(rate * 100);
                    const strategy = item.strategy as string;
                    const chipVariant = strategyVariant[strategy] || 'stable';

                    return (
                      <div
                        key={item.order}
                        className={`flex items-center gap-4 px-6 py-4 border-l-[3px] ${getAccentBorder(strategy)} transition-all duration-300 hover:bg-surface-container-low/50`}
                      >
                        {/* Left: Order + Strategy Badge */}
                        <div className="flex flex-col items-center gap-1.5 w-12 shrink-0">
                          <span className="text-xs text-on-surface-variant font-label">#{item.order}</span>
                          <StatusChip variant={chipVariant} size="sm">
                            {strategyLabel[strategy] || strategy}
                          </StatusChip>
                        </div>

                        {/* Middle: University + Major + Historical Data */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-on-surface text-sm truncate">
                            {item.university?.name}
                          </div>
                          <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                            {item.major?.name}
                            {item.university?.province && (
                              <span className="ml-2 opacity-70">{item.university.province}</span>
                            )}
                          </div>
                          <div className="text-xs text-on-surface-variant mt-1">
                            历年最低位次{' '}
                            <span className="text-on-surface font-medium">
                              {item.admission?.minRank ? item.admission.minRank.toLocaleString() : '-'}
                            </span>
                            <span className="mx-1.5 opacity-30">|</span>
                            最低分{' '}
                            <span className="text-on-surface font-medium">
                              {item.admission?.minScore ?? '-'}
                            </span>
                          </div>
                        </div>

                        {/* Right: Acceptance Probability */}
                        <div className="w-28 shrink-0 text-right">
                          <div className="text-sm font-headline font-extrabold text-on-surface mb-1.5">
                            {percent}%
                          </div>
                          <div className={`w-full h-1.5 rounded-full ${getProgressTrack(percent)} overflow-hidden`}>
                            <div
                              className={`h-full rounded-full ${getProgressColor(percent)} transition-all duration-500`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-on-surface-variant mt-1 font-label">录取概率</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="bg-surface-container-lowest rounded-xl flex flex-col items-center justify-center py-24 px-6">
              <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-5">
                <BulbOutlined className="text-3xl text-on-surface-variant opacity-40" />
              </div>
              <h3 className="text-lg font-headline font-semibold text-on-surface-variant mb-2">
                填写信息后生成志愿方案
              </h3>
              <p className="text-sm text-on-surface-variant opacity-60 max-w-xs text-center">
                系统将根据您的分数和位次，智能推荐冲稳保志愿
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
