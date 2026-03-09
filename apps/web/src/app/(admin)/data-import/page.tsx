'use client';

import { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Input,
  Button,
  Steps,
  Table,
  Alert,
  Space,
  Select,
  InputNumber,
  Image,
  message,
  Spin,
  Typography,
  Statistic,
  Row,
  Col,
  Divider,
  Result,
  Radio,
  Switch,
  Collapse,
  Tag,
  Tooltip,
} from 'antd';
import {
  CloudDownloadOutlined,
  ScanOutlined,
  SaveOutlined,
  WarningOutlined,
  DatabaseOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  ToolOutlined,
  EditOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  checkImportHealth,
  fetchPage,
  runOcr,
  runOcrWithAI,
  saveImportData,
  saveSupplementaryData,
  getImportStats,
  getAiConfigs,
  type FetchPageResult,
  type OcrResult,
  type SupplementaryOcrResult,
  type SupplementaryOcrWithAIResult,
  type ScoreRow,
  type SupplementaryRow,
  type ImportStats,
  type ConflictItem,
  type AiConfig,
} from '@/services/dataImport';

const { Content } = Layout;
const { Title, Text } = Typography;

export default function DataImportPage() {
  const { user, isLoggedIn } = useAuthStore();

  // 状态
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ocrHealthy, setOcrHealthy] = useState<boolean | null>(null);

  // 数据类型
  const [dataType, setDataType] = useState<'score_segment' | 'supplementary'>('score_segment');

  // Step 1: 抓取页面
  const [url, setUrl] = useState('');
  const [fetchResult, setFetchResult] = useState<FetchPageResult | null>(null);

  // Step 2: OCR 识别
  const [year, setYear] = useState(new Date().getFullYear());
  const [province, setProvince] = useState('四川');
  const [examType, setExamType] = useState('物理类');
  const [batch, setBatch] = useState('本科提前批B段');
  const [ocrResult, setOcrResult] = useState<OcrResult | SupplementaryOcrResult | null>(null);

  // Step 3: 保存结果
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    affectedRows: number;
    message?: string;
  } | null>(null);

  // 导入统计
  const [stats, setStats] = useState<ImportStats[]>([]);

  // 可编辑数据 & 校验（一分一段表）
  const [editableData, setEditableData] = useState<ScoreRow[]>([]);
  const [dataErrors, setDataErrors] = useState<Set<number>>(new Set());
  const [dataErrorMessages, setDataErrorMessages] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<number | null>(null);

  // 征集志愿数据
  const [supplementaryData, setSupplementaryData] = useState<SupplementaryRow[]>([]);

  // AI 配置
  const [enableAI, setEnableAI] = useState(false);
  const [aiConfigMode, setAiConfigMode] = useState<'manual' | 'saved'>('saved');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com/v1');
  const [aiModel, setAiModel] = useState('deepseek-chat');
  const [aiResult, setAiResult] = useState<SupplementaryOcrWithAIResult | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);

  // 本地 AI 配置
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [selectedAiConfig, setSelectedAiConfig] = useState<string>('');
  const [loadingAiConfigs, setLoadingAiConfigs] = useState(false);

  // 权限检查
  const isAdmin =
    user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (isAdmin) {
      checkImportHealth()
        .then((h) => setOcrHealthy(h.ocrService))
        .catch(() => setOcrHealthy(false));
      getImportStats()
        .then(setStats)
        .catch(() => {});
    }
  }, [isAdmin]);

  // 加载本地 AI 配置
  const loadAiConfigs = async () => {
    setLoadingAiConfigs(true);
    try {
      const data = await getAiConfigs();
      setAiConfigs(data.configs || []);
      // 自动选择默认配置
      const defaultConfig = data.configs?.find((c) => c.isDefault);
      if (defaultConfig) {
        setSelectedAiConfig(defaultConfig.id);
      } else if (data.configs?.length > 0) {
        setSelectedAiConfig(data.configs[0].id);
      }
    } catch (e) {
      console.error('加载 AI 配置失败:', e);
    } finally {
      setLoadingAiConfigs(false);
    }
  };

  useEffect(() => {
    if (enableAI && aiConfigMode === 'saved' && aiConfigs.length === 0) {
      loadAiConfigs();
    }
  }, [enableAI, aiConfigMode]);

  if (!isLoggedIn || !isAdmin) {
    return (
      <Layout style={{ minHeight: '100vh', background: '#F8FAFC' }}>
        <Content style={{ padding: 24, maxWidth: 800, margin: '80px auto' }}>
          <Result
            status="403"
            title="无权限访问"
            subTitle="此页面仅限管理员使用"
            extra={
              <Link href="/">
                <Button type="primary">返回首页</Button>
              </Link>
            }
          />
        </Content>
      </Layout>
    );
  }

  // 校验数据，返回有问题的分数集合和错误信息
  const validateData = (data: ScoreRow[]) => {
    const errors: string[] = [];
    const errorScores = new Set<number>();
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const expected = prev.cumulative_count + curr.count;
      if (Math.abs(curr.cumulative_count - expected) > 1) {
        errors.push(
          `分数 ${curr.score}: 累计人数不一致（当前 ${curr.cumulative_count}，期望 ${expected}）`
        );
        errorScores.add(curr.score);
      }
    }
    setDataErrors(errorScores);
    setDataErrorMessages(errors);
    return errors.length === 0;
  };

  /**
   * 智能判断出错行：是人数错了还是累计人数错了
   * 往后看 LOOK_AHEAD 行，如果后续行的 count == cumulative_count差值 都成立，
   * 说明后续链条基于当前行的 cumulative_count 是正确的 → 当前行人数错了
   * 否则说明当前行 cumulative_count 错了，应该用 prev.cumulative_count + curr.count 修正
   */
  const handleAutoFix = () => {
    if (editableData.length === 0) return;
    const LOOK_AHEAD = 8;
    const fixed = editableData.map((r) => ({ ...r }));
    let fixedCount = 0;

    for (let i = 1; i < fixed.length; i++) {
      const prev = fixed[i - 1];
      const curr = fixed[i];
      const expected = prev.cumulative_count + curr.count;

      if (Math.abs(curr.cumulative_count - expected) <= 1) continue;

      // 出现不一致，往后看几行判断是哪个字段错了
      // 假设当前行 cumulative_count 是对的，检查后续行是否一致
      let cumulativeChainOk = 0;
      for (let j = i + 1; j < Math.min(i + 1 + LOOK_AHEAD, fixed.length); j++) {
        const diff = fixed[j].cumulative_count - fixed[j - 1].cumulative_count;
        // 注意 j-1 在 j==i+1 时就是当前行 i（用原始 cumulative_count）
        if (Math.abs(diff - fixed[j].count) <= 1) {
          cumulativeChainOk++;
        } else {
          break; // 链条断了
        }
      }

      if (cumulativeChainOk >= Math.min(3, LOOK_AHEAD)) {
        // 后续链条正常 → 当前行的人数错了，用累计人数反推
        const correctCount = curr.cumulative_count - prev.cumulative_count;
        fixed[i] = { ...curr, count: Math.max(0, correctCount) };
        fixedCount++;
      } else {
        // 后续链条也断了 → 当前行的累计人数错了，用人数正推
        fixed[i] = { ...curr, cumulative_count: prev.cumulative_count + curr.count };
        fixedCount++;
      }
    }

    setEditableData(fixed);
    const isValid = validateData(fixed);
    if (isValid) {
      message.success(`智能修复完成，修正了 ${fixedCount} 处问题`);
    } else {
      message.warning('自动修复后仍有问题，请手动检查');
    }
  };

  // 编辑单元格
  const handleCellEdit = (score: number, field: 'count' | 'cumulative_count', value: number) => {
    const newData = editableData.map((row) =>
      row.score === score ? { ...row, [field]: value } : row
    );
    setEditableData(newData);
    validateData(newData);
  };

  // Step 1: 抓取页面
  const handleFetch = async () => {
    if (!url.trim()) {
      message.warning('请输入目标网页 URL');
      return;
    }
    setLoading(true);
    try {
      const result = await fetchPage(url);
      setFetchResult(result);
      if (result.image_count > 0) {
        setCurrentStep(1);
        message.success(`找到 ${result.image_count} 张图片`);
      } else {
        message.warning('未在页面中找到图片，请检查 URL');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '抓取失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OCR 识别
  const handleOcr = async () => {
    if (!fetchResult) return;
    setLoading(true);
    try {
      // 征集志愿 + 启用 AI 校验
      if (dataType === 'supplementary' && enableAI) {
        const aiParams: Parameters<typeof runOcrWithAI>[0] = {
          imageUrls: fetchResult.image_urls,
          year,
          province,
          examType,
          batch,
        };

        if (aiConfigMode === 'saved' && selectedAiConfig) {
          // 使用已保存的配置
          aiParams.aiConfigId = selectedAiConfig;
        } else if (aiConfigMode === 'manual' && aiApiKey) {
          // 手动输入配置
          aiParams.aiApiKey = aiApiKey;
          aiParams.aiBaseUrl = aiBaseUrl;
          aiParams.aiModel = aiModel;
        } else {
          message.error('请配置 AI 参数');
          setLoading(false);
          return;
        }

        const result = await runOcrWithAI(aiParams);
        setAiResult(result);
        setOcrResult(result);
        setSupplementaryData([...result.data]);
        setCurrentStep(2);

        if (result.needs_review) {
          message.warning(`识别完成，有 ${result.conflicts_count} 条冲突需要人工审核`);
          setShowConflicts(true);
        } else if (result.is_valid) {
          message.success(`OCR + AI 双重识别成功: ${result.total_rows} 条数据`);
        } else {
          message.warning(`识别完成，但有 ${result.errors.length} 个问题`);
        }
        return;
      }

      // 普通 OCR 识别
      const result = await runOcr({
        imageUrls: fetchResult.image_urls,
        dataType,
        year,
        province,
        examType,
        batch,
      });
      setOcrResult(result);
      setAiResult(null);

      if (dataType === 'score_segment') {
        const scoreResult = result as OcrResult;
        setEditableData([...scoreResult.data]);
        validateData(scoreResult.data);
      } else {
        const suppResult = result as SupplementaryOcrResult;
        setSupplementaryData([...suppResult.data]);
      }

      setCurrentStep(2);
      if (result.is_valid) {
        message.success(`识别成功: ${result.total_rows} 条数据`);
      } else {
        message.warning(`识别完成，但有 ${result.errors.length} 个问题`);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || 'OCR 失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: 保存
  const handleSave = async () => {
    setLoading(true);
    try {
      if (dataType === 'score_segment') {
        if (editableData.length === 0) return;
        const mappedData = editableData.map((row) => ({
          score: row.score,
          count: row.count,
          cumulativeCount: row.cumulative_count,
        }));
        const result = await saveImportData({
          year,
          province,
          examType,
          data: mappedData,
        });
        setSaveResult(result);
        message.success(`成功导入 ${result.affectedRows} 条记录`);
      } else {
        if (supplementaryData.length === 0) return;
        const result = await saveSupplementaryData({
          year,
          province,
          examType,
          batch,
          data: supplementaryData,
        });
        setSaveResult(result);
        message.success(result.message || `成功导入 ${result.affectedRows} 条记录`);
      }

      setCurrentStep(3);
      // 刷新统计
      getImportStats().then(setStats).catch(() => {});
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  // 重置
  const handleReset = () => {
    setCurrentStep(0);
    setUrl('');
    setFetchResult(null);
    setOcrResult(null);
    setSaveResult(null);
    setEditableData([]);
    setSupplementaryData([]);
    setDataErrors(new Set());
    setDataErrorMessages([]);
    setEditingKey(null);
    setAiResult(null);
    setShowConflicts(false);
  };

  // 处理冲突：选择 OCR 结果
  const handleUseOcrResult = (_conflict: ConflictItem) => {
    // 已经使用的是 OCR 结果，无需操作
    message.info('已使用 OCR 结果');
  };

  // 处理冲突：选择 AI 结果
  const handleUseAiResult = (conflict: ConflictItem) => {
    const key = `${conflict.ocr.university_code}_${conflict.ocr.major_group_code}_${conflict.ocr.major_code}`;
    setSupplementaryData(prev =>
      prev.map(row => {
        const rowKey = `${row.university_code}_${row.major_group_code}_${row.major_code}`;
        if (rowKey === key) {
          return { ...row, plan_count: conflict.ai.plan_count, tuition: conflict.ai.tuition };
        }
        return row;
      })
    );
    message.success('已切换为 AI 结果');
  };

  // OCR 数据表格列（可编辑）
  const ocrColumns = [
    { title: '分数', dataIndex: 'score', key: 'score', width: 80 },
    {
      title: '人数',
      dataIndex: 'count',
      key: 'count',
      width: 120,
      render: (val: number, record: ScoreRow) =>
        editingKey === record.score ? (
          <InputNumber
            size="small"
            min={0}
            value={val}
            onChange={(v) => v !== null && handleCellEdit(record.score, 'count', v)}
            onBlur={() => setEditingKey(null)}
            onPressEnter={() => setEditingKey(null)}
            autoFocus
            style={{ width: 90 }}
          />
        ) : (
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => setEditingKey(record.score)}
          >
            {val} <EditOutlined style={{ fontSize: 12, color: '#999' }} />
          </span>
        ),
    },
    {
      title: '累计人数',
      dataIndex: 'cumulative_count',
      key: 'cumulative_count',
      width: 140,
      render: (val: number, record: ScoreRow) =>
        editingKey === record.score ? (
          <InputNumber
            size="small"
            min={0}
            value={val}
            onChange={(v) => v !== null && handleCellEdit(record.score, 'cumulative_count', v)}
            onBlur={() => setEditingKey(null)}
            onPressEnter={() => setEditingKey(null)}
            style={{ width: 100 }}
          />
        ) : (
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => setEditingKey(record.score)}
          >
            {val} <EditOutlined style={{ fontSize: 12, color: '#999' }} />
          </span>
        ),
    },
  ];

  // 统计表格列
  const statsColumns = [
    { title: '年份', dataIndex: 'year', key: 'year', width: 80 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 80 },
    { title: '类型', dataIndex: 'examType', key: 'examType', width: 100 },
    { title: '记录数', dataIndex: 'count', key: 'count', width: 80 },
    {
      title: '分数范围',
      key: 'range',
      render: (_: any, r: ImportStats) => `${r.maxScore} ~ ${r.minScore}`,
    },
  ];

  // 征集志愿表格列
  const supplementaryColumns = [
    { title: '考试类型', dataIndex: 'exam_type', key: 'exam_type', width: 80, fixed: 'left' as const },
    { title: '招生类型', dataIndex: 'enrollment_type', key: 'enrollment_type', width: 120 },
    { title: '院校代码', dataIndex: 'university_code', key: 'university_code', width: 80 },
    { title: '院校名称', dataIndex: 'university_name', key: 'university_name', width: 150 },
    { title: '专业组', dataIndex: 'major_group_code', key: 'major_group_code', width: 70 },
    { title: '组计划', dataIndex: 'major_group_plan', key: 'major_group_plan', width: 60 },
    { title: '专业代码', dataIndex: 'major_code', key: 'major_code', width: 70 },
    { title: '专业名称', dataIndex: 'major_name', key: 'major_name', width: 150 },
    { title: '专业备注', dataIndex: 'major_note', key: 'major_note', width: 120 },
    { title: '计划数', dataIndex: 'plan_count', key: 'plan_count', width: 60 },
    { title: '收费', dataIndex: 'tuition', key: 'tuition', width: 60 },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/">
            <Button type="text" icon={<ArrowLeftOutlined />}>
              返回首页
            </Button>
          </Link>
        </div>

        <Title level={3} style={{ marginBottom: 8 }}>
          <DatabaseOutlined /> 数据导入管理
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          从教育考试院网页自动提取数据并导入数据库
        </Text>

        {/* OCR 服务状态 */}
        {ocrHealthy === false && (
          <Alert
            message="OCR 服务未启动"
            description="请先在服务器上启动 OCR 微服务: cd services/ocr-service && python main.py"
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 步骤条 */}
        <Steps
          current={currentStep}
          style={{ marginBottom: 32 }}
          items={[
            { title: '输入网址', description: '抓取页面图片' },
            { title: 'OCR 识别', description: '提取表格数据' },
            { title: '数据预览', description: '校验并确认' },
            { title: '导入完成', description: '写入数据库' },
          ]}
        />

        <Spin spinning={loading}>
          {/* Step 0: 输入 URL */}
          {currentStep === 0 && (
            <Card>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>选择数据类型</Text>
                  <Radio.Group
                    value={dataType}
                    onChange={(e) => setDataType(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                  >
                    <Radio.Button value="score_segment">一分一段表</Radio.Button>
                    <Radio.Button value="supplementary">征集志愿</Radio.Button>
                  </Radio.Group>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <Text strong>输入目标网页地址</Text>
                <Text type="secondary">
                  {dataType === 'score_segment'
                    ? '粘贴教育考试院的一分一段表页面 URL'
                    : '粘贴教育考试院的征集志愿页面 URL（如本科一批征集志愿）'}
                </Text>
                <Input.Search
                  placeholder={
                    dataType === 'score_segment'
                      ? '例如: https://www.sceea.cn/Html/202506/Newsdetail_xxx.html'
                      : '例如: https://www.sceea.cn/Html/202507/Newsdetail_4395.html'
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  enterButton={
                    <Button
                      type="primary"
                      icon={<CloudDownloadOutlined />}
                      disabled={ocrHealthy === false}
                    >
                      抓取页面
                    </Button>
                  }
                  onSearch={handleFetch}
                  size="large"
                />
              </Space>
            </Card>
          )}

          {/* Step 1: 配置参数 + 图片预览 */}
          {currentStep === 1 && fetchResult && (
            <Card>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Alert
                  message={`页面: ${fetchResult.title}`}
                  description={`找到 ${fetchResult.image_count} 张图片，数据类型: ${dataType === 'score_segment' ? '一分一段表' : '征集志愿'}`}
                  type="success"
                  showIcon
                />

                <Row gutter={16}>
                  <Col span={6}>
                    <Text strong>年份</Text>
                    <InputNumber
                      value={year}
                      onChange={(v) => v && setYear(v)}
                      min={2020}
                      max={2030}
                      style={{ width: '100%', marginTop: 4 }}
                    />
                  </Col>
                  <Col span={6}>
                    <Text strong>省份</Text>
                    <Select
                      value={province}
                      onChange={setProvince}
                      style={{ width: '100%', marginTop: 4 }}
                      options={[
                        { value: '四川', label: '四川' },
                        { value: '重庆', label: '重庆' },
                        { value: '云南', label: '云南' },
                        { value: '贵州', label: '贵州' },
                      ]}
                    />
                  </Col>
                  <Col span={6}>
                    <Text strong>考试类型</Text>
                    <Select
                      value={examType}
                      onChange={setExamType}
                      style={{ width: '100%', marginTop: 4 }}
                      options={[
                        { value: '物理类', label: '物理类' },
                        { value: '历史类', label: '历史类' },
                        { value: '理科', label: '理科' },
                        { value: '文科', label: '文科' },
                      ]}
                    />
                  </Col>
                  {dataType === 'supplementary' && (
                    <Col span={6}>
                      <Text strong>批次</Text>
                      <Select
                        value={batch}
                        onChange={setBatch}
                        style={{ width: '100%', marginTop: 4 }}
                        options={[
                          { value: '本科提前批A段', label: '本科提前批A段' },
                          { value: '本科提前批B段', label: '本科提前批B段' },
                          { value: '本科批A段(国家专项)', label: '本科批A段(国家专项)' },
                          { value: '本科批A段(地方专项)', label: '本科批A段(地方专项)' },
                          { value: '本科批B段', label: '本科批B段' },
                          { value: '本科批(高校专项)', label: '本科批(高校专项)' },
                          { value: '专科批', label: '专科批' },
                          { value: '专科提前批', label: '专科提前批' },
                        ]}
                      />
                    </Col>
                  )}
                </Row>

                {/* AI 配置（仅征集志愿） */}
                {dataType === 'supplementary' && (
                  <Collapse
                    items={[
                      {
                        key: 'ai',
                        label: (
                          <Space>
                            <RobotOutlined />
                            <span>AI 校验配置</span>
                            {enableAI && <Tag color="blue">已启用</Tag>}
                          </Space>
                        ),
                        children: (
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <Text strong>启用 AI 校验</Text>
                              <Switch checked={enableAI} onChange={setEnableAI} />
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                OCR + AI 双重识别，自动比对结果，冲突处人工审核
                              </Text>
                            </div>
                            {enableAI && (
                              <>
                                <Radio.Group
                                  value={aiConfigMode}
                                  onChange={(e) => setAiConfigMode(e.target.value)}
                                  style={{ marginBottom: 12 }}
                                >
                                  <Radio.Button value="saved">使用已保存配置</Radio.Button>
                                  <Radio.Button value="manual">手动输入</Radio.Button>
                                </Radio.Group>

                                {aiConfigMode === 'saved' ? (
                                  <Row gutter={16}>
                                    <Col span={16}>
                                      <Text strong>选择 AI 配置</Text>
                                      <Select
                                        value={selectedAiConfig}
                                        onChange={setSelectedAiConfig}
                                        loading={loadingAiConfigs}
                                        style={{ width: '100%', marginTop: 4 }}
                                        placeholder="选择已保存的 AI 配置"
                                        options={aiConfigs.map(c => ({
                                          value: c.id,
                                          label: `${c.name}${c.isDefault ? ' (默认)' : ''}`,
                                        }))}
                                      />
                                    </Col>
                                    <Col span={8}>
                                      <Button
                                        style={{ marginTop: 24 }}
                                        onClick={loadAiConfigs}
                                        loading={loadingAiConfigs}
                                      >
                                        刷新配置
                                      </Button>
                                    </Col>
                                    {aiConfigs.length === 0 && !loadingAiConfigs && (
                                      <Col span={24}>
                                        <Alert
                                          message="未找到 AI 配置"
                                          description={
                                            <span>
                                              请先在 <Link href="/admin/ai-config">AI 配置管理</Link> 中添加配置，或切换到手动输入模式
                                            </span>
                                          }
                                          type="warning"
                                          showIcon
                                          style={{ marginTop: 8 }}
                                        />
                                      </Col>
                                    )}
                                  </Row>
                                ) : (
                                  <>
                                    <Row gutter={16}>
                                      <Col span={12}>
                                        <Text strong>API Key</Text>
                                        <Input.Password
                                          value={aiApiKey}
                                          onChange={(e) => setAiApiKey(e.target.value)}
                                          placeholder="sk-xxx..."
                                          style={{ marginTop: 4 }}
                                        />
                                      </Col>
                                      <Col span={12}>
                                        <Text strong>API Base URL</Text>
                                        <Select
                                          value={aiBaseUrl}
                                          onChange={setAiBaseUrl}
                                          style={{ width: '100%', marginTop: 4 }}
                                          options={[
                                            { value: 'https://api.deepseek.com/v1', label: 'DeepSeek' },
                                            { value: 'https://api.openai.com/v1', label: 'OpenAI' },
                                            { value: 'https://api.moonshot.cn/v1', label: 'Moonshot (Kimi)' },
                                            { value: 'https://dashscope.aliyuncs.com/compatible-mode/v1', label: '阿里云百炼' },
                                          ]}
                                        />
                                      </Col>
                                    </Row>
                                    <Row gutter={16}>
                                      <Col span={12}>
                                        <Text strong>模型</Text>
                                        <Input
                                          value={aiModel}
                                          onChange={(e) => setAiModel(e.target.value)}
                                          placeholder="deepseek-chat"
                                          style={{ marginTop: 4 }}
                                        />
                                      </Col>
                                      <Col span={12}>
                                        <Text type="secondary" style={{ display: 'block', marginTop: 24 }}>
                                          推荐: DeepSeek (deepseek-chat) 或 GPT-4o-mini
                                        </Text>
                                      </Col>
                                    </Row>
                                  </>
                                )}
                              </>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}

                <Divider>图片预览（前 6 张）</Divider>
                <Image.PreviewGroup>
                  <Row gutter={[8, 8]}>
                    {fetchResult.image_urls.slice(0, 6).map((imgUrl, i) => (
                      <Col span={4} key={i}>
                        <Image
                          src={imgUrl}
                          alt={`图片 ${i + 1}`}
                          style={{ borderRadius: 4 }}
                          fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F/PQAJpAN42kLfHwAAAABJRU5ErkJggg=="
                        />
                      </Col>
                    ))}
                  </Row>
                </Image.PreviewGroup>
                {fetchResult.image_count > 6 && (
                  <Text type="secondary">
                    还有 {fetchResult.image_count - 6} 张图片未显示
                  </Text>
                )}

                <Space>
                  <Button onClick={() => setCurrentStep(0)}>上一步</Button>
                  <Button
                    type="primary"
                    icon={enableAI && dataType === 'supplementary' ? <RobotOutlined /> : <ScanOutlined />}
                    onClick={handleOcr}
                    disabled={enableAI && dataType === 'supplementary' && (
                      aiConfigMode === 'manual' ? !aiApiKey : !selectedAiConfig
                    )}
                  >
                    {enableAI && dataType === 'supplementary' ? '开始 OCR + AI 识别' : '开始 OCR 识别'}
                  </Button>
                  {enableAI && dataType === 'supplementary' && aiConfigMode === 'manual' && !aiApiKey && (
                    <Text type="warning">请先配置 AI API Key</Text>
                  )}
                  {enableAI && dataType === 'supplementary' && aiConfigMode === 'saved' && !selectedAiConfig && (
                    <Text type="warning">请先选择 AI 配置</Text>
                  )}
                </Space>
              </Space>
            </Card>
          )}

          {/* Step 2: OCR 结果预览 */}
          {currentStep === 2 && ocrResult && (
            <Card>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {dataType === 'score_segment' ? (
                  <>
                    {/* 一分一段表预览 */}
                    <Row gutter={16}>
                      <Col span={6}>
                        <Statistic title="识别行数" value={editableData.length} />
                      </Col>
                      <Col span={6}>
                        <Statistic title="分数范围" value={(ocrResult as OcrResult).score_range} />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="数据状态"
                          value={dataErrorMessages.length === 0 ? '校验通过' : `${dataErrorMessages.length} 个问题`}
                          prefix={dataErrorMessages.length === 0 ? <CheckCircleOutlined /> : <WarningOutlined />}
                          valueStyle={{
                            color: dataErrorMessages.length === 0 ? '#52c41a' : '#faad14',
                          }}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="目标"
                          value={`${year} ${province} ${examType}`}
                        />
                      </Col>
                    </Row>

                    {dataErrorMessages.length > 0 && (
                      <Alert
                        message={`发现 ${dataErrorMessages.length} 个问题`}
                        description={
                          <div>
                            <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                              {dataErrorMessages.slice(0, 10).map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                              {dataErrorMessages.length > 10 && (
                                <li>...还有 {dataErrorMessages.length - 10} 个</li>
                              )}
                            </ul>
                            <Space>
                              <Button
                                type="primary"
                                size="small"
                                icon={<ToolOutlined />}
                                onClick={handleAutoFix}
                              >
                                智能修复
                              </Button>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                自动判断是人数还是累计人数出错并修正，也可点击数值手动编辑
                              </Text>
                            </Space>
                          </div>
                        }
                        type="warning"
                        showIcon
                        icon={<WarningOutlined />}
                      />
                    )}

                    <Table
                      dataSource={editableData}
                      columns={ocrColumns}
                      rowKey="score"
                      size="small"
                      pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                      scroll={{ y: 400 }}
                      rowClassName={(record) =>
                        dataErrors.has(record.score) ? 'row-error' : ''
                      }
                    />
                  </>
                ) : (
                  <>
                    {/* 征集志愿预览 */}
                    <Row gutter={16}>
                      <Col span={3}>
                        <Statistic title="识别行数" value={supplementaryData.length} />
                      </Col>
                      <Col span={3}>
                        <Statistic title="院校数" value={(ocrResult as SupplementaryOcrResult).university_count} />
                      </Col>
                      <Col span={3}>
                        <Statistic title="专业组数" value={(ocrResult as SupplementaryOcrResult).major_group_count} />
                      </Col>
                      <Col span={3}>
                        <Statistic
                          title="数据状态"
                          value={ocrResult.is_valid ? '校验通过' : `${ocrResult.errors.length} 个问题`}
                          prefix={ocrResult.is_valid ? <CheckCircleOutlined /> : <WarningOutlined />}
                          valueStyle={{
                            color: ocrResult.is_valid ? '#52c41a' : '#faad14',
                          }}
                        />
                      </Col>
                      {aiResult && (
                        <>
                          <Col span={3}>
                            <Statistic
                              title="AI 校验"
                              value={aiResult.ai_enabled ? '已启用' : '未启用'}
                              prefix={<RobotOutlined />}
                              valueStyle={{ color: aiResult.ai_enabled ? '#1890ff' : '#999' }}
                            />
                          </Col>
                          <Col span={3}>
                            <Statistic
                              title="冲突数"
                              value={aiResult.conflicts_count}
                              prefix={aiResult.conflicts_count > 0 ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
                              valueStyle={{ color: aiResult.conflicts_count > 0 ? '#ff4d4f' : '#52c41a' }}
                            />
                          </Col>
                        </>
                      )}
                      <Col span={aiResult ? 6 : 12}>
                        <Statistic
                          title="目标"
                          value={`${year} ${province} ${batch}`}
                        />
                      </Col>
                    </Row>

                    {/* AI 比对结果摘要 */}
                    {aiResult?.comparison && (
                      <Alert
                        message="OCR + AI 双重识别结果"
                        description={
                          <Space direction="vertical" size="small">
                            <div>
                              <Tag color="green">一致: {aiResult.comparison.summary.matched_count}</Tag>
                              <Tag color="red">冲突: {aiResult.comparison.summary.conflict_count}</Tag>
                              <Tag color="orange">仅OCR: {aiResult.comparison.summary.ocr_only_count}</Tag>
                              <Tag color="blue">仅AI: {aiResult.comparison.summary.ai_only_count}</Tag>
                            </div>
                            {aiResult.conflicts_count > 0 && (
                              <Button
                                type="link"
                                size="small"
                                icon={<SettingOutlined />}
                                onClick={() => setShowConflicts(!showConflicts)}
                              >
                                {showConflicts ? '隐藏冲突详情' : '查看冲突详情'}
                              </Button>
                            )}
                          </Space>
                        }
                        type={aiResult.conflicts_count > 0 ? 'warning' : 'success'}
                        showIcon
                        icon={<RobotOutlined />}
                      />
                    )}

                    {/* 冲突详情 */}
                    {showConflicts && aiResult?.comparison?.conflicts && aiResult.comparison.conflicts.length > 0 && (
                      <Card title="冲突数据（需人工审核）" size="small" style={{ background: '#fffbe6' }}>
                        <Table
                          dataSource={aiResult.comparison.conflicts}
                          rowKey={(r) => `${r.ocr.university_code}_${r.ocr.major_group_code}_${r.ocr.major_code}`}
                          size="small"
                          pagination={false}
                          scroll={{ x: 900 }}
                          columns={[
                            { title: '院校', dataIndex: ['ocr', 'university_name'], width: 120 },
                            { title: '专业组', dataIndex: ['ocr', 'major_group_code'], width: 60 },
                            { title: '专业', dataIndex: ['ocr', 'major_name'], width: 150 },
                            {
                              title: 'OCR 计划数',
                              dataIndex: ['ocr', 'plan_count'],
                              width: 80,
                              render: (v, r: ConflictItem) => (
                                <span style={{ color: r.diff.plan_count ? '#ff4d4f' : undefined, fontWeight: r.diff.plan_count ? 'bold' : undefined }}>
                                  {v}
                                </span>
                              ),
                            },
                            {
                              title: 'AI 计划数',
                              dataIndex: ['ai', 'plan_count'],
                              width: 80,
                              render: (v, r: ConflictItem) => (
                                <span style={{ color: r.diff.plan_count ? '#52c41a' : undefined, fontWeight: r.diff.plan_count ? 'bold' : undefined }}>
                                  {v}
                                </span>
                              ),
                            },
                            {
                              title: 'OCR 学费',
                              dataIndex: ['ocr', 'tuition'],
                              width: 80,
                              render: (v, r: ConflictItem) => (
                                <span style={{ color: r.diff.tuition ? '#ff4d4f' : undefined, fontWeight: r.diff.tuition ? 'bold' : undefined }}>
                                  {v}
                                </span>
                              ),
                            },
                            {
                              title: 'AI 学费',
                              dataIndex: ['ai', 'tuition'],
                              width: 80,
                              render: (v, r: ConflictItem) => (
                                <span style={{ color: r.diff.tuition ? '#52c41a' : undefined, fontWeight: r.diff.tuition ? 'bold' : undefined }}>
                                  {v}
                                </span>
                              ),
                            },
                            {
                              title: '操作',
                              width: 150,
                              render: (_: any, r: ConflictItem) => (
                                <Space size="small">
                                  <Tooltip title="使用 OCR 结果">
                                    <Button size="small" onClick={() => handleUseOcrResult(r)}>OCR</Button>
                                  </Tooltip>
                                  <Tooltip title="使用 AI 结果">
                                    <Button size="small" type="primary" onClick={() => handleUseAiResult(r)}>AI</Button>
                                  </Tooltip>
                                </Space>
                              ),
                            },
                          ]}
                        />
                      </Card>
                    )}

                    {ocrResult.errors.length > 0 && (
                      <Alert
                        message={`发现 ${ocrResult.errors.length} 个问题`}
                        description={
                          <ul style={{ margin: 0, paddingLeft: 20 }}>
                            {ocrResult.errors.slice(0, 10).map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        }
                        type="warning"
                        showIcon
                      />
                    )}

                    <Table
                      dataSource={supplementaryData}
                      columns={supplementaryColumns}
                      rowKey={(r) => `${r.university_code}_${r.major_group_code}_${r.major_code}_${r.major_name}`}
                      size="small"
                      pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                      scroll={{ x: 1100, y: 400 }}
                    />
                  </>
                )}
                <style jsx global>{`
                  .row-error td { background: #fff2f0 !important; }
                  .row-error:hover td { background: #ffebe8 !important; }
                `}</style>

                <Space>
                  <Button onClick={() => setCurrentStep(1)}>上一步</Button>
                  {dataType === 'score_segment' && dataErrorMessages.length > 0 && (
                    <Button icon={<ToolOutlined />} onClick={handleAutoFix}>
                      智能修复
                    </Button>
                  )}
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    disabled={dataType === 'score_segment' ? editableData.length === 0 : supplementaryData.length === 0}
                  >
                    {dataType === 'score_segment' && dataErrorMessages.length > 0
                      ? '忽略问题，强制导入'
                      : '确认导入数据库'}
                  </Button>
                </Space>
              </Space>
            </Card>
          )}

          {/* Step 3: 完成 */}
          {currentStep === 3 && saveResult && (
            <Card>
              <Result
                status="success"
                title="数据导入成功"
                subTitle={
                  saveResult.message ||
                  `成功导入 ${saveResult.affectedRows} 条 ${year}年 ${province} ${dataType === 'score_segment' ? examType : batch} 数据`
                }
                extra={[
                  <Button
                    key="again"
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                  >
                    继续导入
                  </Button>,
                  <Link key="home" href="/">
                    <Button>返回首页</Button>
                  </Link>,
                ]}
              />
            </Card>
          )}
        </Spin>

        {/* 已导入数据统计 */}
        {stats.length > 0 && (
          <Card title="已导入数据" style={{ marginTop: 24 }}>
            <Table
              dataSource={stats}
              columns={statsColumns}
              rowKey={(r) => `${r.year}-${r.province}-${r.examType}`}
              size="small"
              pagination={false}
            />
          </Card>
        )}
      </Content>
    </Layout>
  );
}
