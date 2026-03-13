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
  ExclamationCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  checkImportHealth,
  fetchPage,
  runOcr,
  runMultiEngineOcr,
  saveImportData,
  saveSupplementaryData,
  getImportStats,
  getAiConfigs,
  type FetchPageResult,
  type OcrResult,
  type SupplementaryOcrResult,
  type ScoreRow,
  type SupplementaryRow,
  type ImportStats,
  type AiConfig,
  type MultiEngineValidationResponse,
  type SupplementaryRowWithConflict,
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

  // 征集志愿数据（包含冲突信息）
  const [supplementaryData, setSupplementaryData] = useState<SupplementaryRowWithConflict[]>([]);
  // 征集志愿编辑状态：{ rowKey: string, field: string }
  const [editingSupplementaryCell, setEditingSupplementaryCell] = useState<{ rowKey: string; field: string } | null>(null);

  // AI 配置（用于多引擎校验中的 AI 引擎）
  const [aiConfigMode, setAiConfigMode] = useState<'manual' | 'saved'>('saved');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com/v1');
  const [aiModel, setAiModel] = useState('deepseek-chat');

  // 本地 AI 配置
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [selectedAiConfig, setSelectedAiConfig] = useState<string>('');
  const [loadingAiConfigs, setLoadingAiConfigs] = useState(false);

  // 多引擎校验相关
  const [multiEngineMode, setMultiEngineMode] = useState(false);
  const [multiEngineResult, setMultiEngineResult] = useState<MultiEngineValidationResponse | null>(null);
  const [multiEngineLoading, setMultiEngineLoading] = useState(false);
  const [engineOptions, setEngineOptions] = useState({
    enableBaidu: true,
    enablePaddleocr: true,
    enableRapid: true,
    enableAi: false,
  });

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

  // Step 2: OCR 识别（纯 OCR，不含 AI）
  const handleOcr = async () => {
    if (!fetchResult) return;
    setLoading(true);
    try {
      const result = await runOcr({
        imageUrls: fetchResult.image_urls,
        dataType,
        year,
        province,
        examType,
        batch,
        sourceUrl: url,  // 传递来源 URL
      });
      setOcrResult(result);

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
        message.success(`OCR 识别成功: ${result.total_rows} 条数据`);
      } else {
        message.warning(`识别完成，但有 ${result.errors.length} 个问题`);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || 'OCR 失败');
    } finally {
      setLoading(false);
    }
  };

  // 多引擎交叉校验
  const handleMultiEngineOcr = async () => {
    if (!fetchResult) return;

    // 检查是否至少启用了 2 个引擎
    const enabledCount = Object.values(engineOptions).filter(Boolean).length;
    if (enabledCount < 2) {
      message.warning('请至少启用 2 个 OCR 引擎进行交叉校验');
      return;
    }

    // 如果启用 AI，检查配置
    if (engineOptions.enableAi) {
      if (aiConfigMode === 'saved' && !selectedAiConfig) {
        message.error('启用 AI 校验需要先选择 AI 配置');
        return;
      }
      if (aiConfigMode === 'manual' && !aiApiKey) {
        message.error('启用 AI 校验需要先输入 API Key');
        return;
      }
    }

    setMultiEngineLoading(true);
    setMultiEngineResult(null);

    try {
      const params: Parameters<typeof runMultiEngineOcr>[0] = {
        imageUrls: fetchResult.image_urls,
        dataType,
        year,
        province,
        examType,
        batch,
        ...engineOptions,
      };

      // AI 配置
      if (engineOptions.enableAi) {
        if (aiConfigMode === 'saved' && selectedAiConfig) {
          // 从已保存配置获取
          const config = aiConfigs.find(c => c.id === selectedAiConfig);
          if (config) {
            params.aiApiKey = ''; // 后端会从配置 ID 获取
            params.aiBaseUrl = config.apiBaseUrl;
            params.aiModel = config.modelName;
          }
        } else {
          params.aiApiKey = aiApiKey;
          params.aiBaseUrl = aiBaseUrl;
          params.aiModel = aiModel;
        }
      }

      const result = await runMultiEngineOcr(params);
      setMultiEngineResult(result);

      // 合并所有数据（自动通过 + 待审核），待审核数据带上冲突信息
      const approvedWithFlag: SupplementaryRowWithConflict[] = result.approved_data.map(row => ({
        ...row,
        _hasConflict: false,
        _confidence: 'high' as const,
      }));

      const pendingWithConflict: SupplementaryRowWithConflict[] = result.pending_review_data.map(item => ({
        exam_type: (item.merged_data.exam_type as string) || '',
        enrollment_type: (item.merged_data.enrollment_type as string) || '',
        university_code: (item.merged_data.university_code as string) || '',
        university_name: (item.merged_data.university_name as string) || '',
        university_location: (item.merged_data.university_location as string) || '',
        university_note: (item.merged_data.university_note as string) || '',
        major_group_code: (item.merged_data.major_group_code as string) || '',
        major_group_subject: (item.merged_data.major_group_subject as string) || '',
        major_group_plan: (item.merged_data.major_group_plan as number) || 0,
        major_code: (item.merged_data.major_code as string) || '',
        major_name: (item.merged_data.major_name as string) || '',
        major_note: (item.merged_data.major_note as string) || '',
        plan_count: (item.merged_data.plan_count as number) || 0,
        tuition: (item.merged_data.tuition as string) || '',
        page_number: (item.merged_data.page_number as number) || undefined,
        _hasConflict: item.conflict_fields.length > 0,
        _confidence: item.confidence,
        _conflictFields: item.conflict_fields,
        _fieldDiffs: item.field_diffs,
        _engineSources: item.engine_sources,
      }));

      // 合并数据
      setSupplementaryData([...approvedWithFlag, ...pendingWithConflict]);

      setCurrentStep(2);
      setOcrResult({
        total_rows: result.total_records,
        university_count: new Set([...result.approved_data, ...pendingWithConflict].map(r => r.university_code)).size,
        major_group_count: 0,
        is_valid: result.is_valid,
        errors: result.errors,
        data: [...result.approved_data, ...pendingWithConflict],
      } as SupplementaryOcrResult);

      // 显示结果摘要
      if (result.pending_review_count > 0) {
        message.warning(
          `多引擎校验完成: ${result.auto_approved_count} 条自动通过, ${result.pending_review_count} 条有冲突需确认`
        );
      } else {
        message.success(
          `多引擎校验完成: ${result.total_records} 条数据全部通过校验`
        );
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '多引擎校验失败');
    } finally {
      setMultiEngineLoading(false);
    }
  };

  // 编辑征集志愿数据单元格
  const handleSupplementaryCellEdit = (rowKey: string, field: keyof SupplementaryRowWithConflict, value: any) => {
    setSupplementaryData((prev) =>
      prev.map((row) => {
        const key = `${row.university_code}_${row.major_group_code}_${row.major_code}_${row.major_name}`;
        if (key === rowKey) {
          // 编辑后清除该字段的冲突标记
          const newConflictFields = row._conflictFields?.filter(f => f !== field) || [];
          return {
            ...row,
            [field]: value,
            _conflictFields: newConflictFields,
            _hasConflict: newConflictFields.length > 0,
          };
        }
        return row;
      })
    );
  };

  // 应用某个引擎的值到冲突字段
  const handleApplyEngineValue = (rowKey: string, field: string, value: any) => {
    handleSupplementaryCellEdit(rowKey, field as keyof SupplementaryRowWithConflict, value);
    message.success('已应用该值');
  };

  // 生成征集志愿行的唯一 key
  const getSupplementaryRowKey = (row: SupplementaryRow) =>
    `${row.university_code}_${row.major_group_code}_${row.major_code}_${row.major_name}`;

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
    setEditingSupplementaryCell(null);
    // 多引擎相关
    setMultiEngineMode(false);
    setMultiEngineResult(null);
    setMultiEngineLoading(false);
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

  // 征集志愿表格列（带排序、筛选和编辑功能）
  // 通用的可编辑单元格渲染函数
  const renderEditableCell = (
    field: keyof SupplementaryRowWithConflict,
    val: any,
    record: SupplementaryRowWithConflict,
    type: 'text' | 'number' = 'text',
    width: number = 100
  ) => {
    const rowKey = getSupplementaryRowKey(record);
    const isEditing = editingSupplementaryCell?.rowKey === rowKey && editingSupplementaryCell?.field === field;

    if (isEditing) {
      if (type === 'number') {
        return (
          <InputNumber
            size="small"
            min={0}
            defaultValue={val}
            autoFocus
            onBlur={() => setEditingSupplementaryCell(null)}
            onChange={(v) => {
              if (v !== null) handleSupplementaryCellEdit(rowKey, field, v);
            }}
            onPressEnter={() => setEditingSupplementaryCell(null)}
            style={{ width: width - 10 }}
          />
        );
      }
      return (
        <Input
          size="small"
          defaultValue={val}
          autoFocus
          onBlur={(e) => {
            handleSupplementaryCellEdit(rowKey, field, e.target.value);
            setEditingSupplementaryCell(null);
          }}
          onPressEnter={(e) => {
            handleSupplementaryCellEdit(rowKey, field, (e.target as HTMLInputElement).value);
            setEditingSupplementaryCell(null);
          }}
          style={{ width: width - 10 }}
        />
      );
    }

    const displayVal = val ?? '-';
    return (
      <span
        style={{ cursor: 'pointer' }}
        onClick={() => setEditingSupplementaryCell({ rowKey, field })}
      >
        {displayVal} <EditOutlined style={{ fontSize: 10, color: '#999' }} />
      </span>
    );
  };

  // 从数据中动态生成筛选选项
  const getUniqueFilters = (field: keyof SupplementaryRowWithConflict) => {
    const values = new Set(supplementaryData.map(r => r[field]).filter(Boolean));
    return Array.from(values).sort().map(v => ({ text: String(v), value: String(v) }));
  };

  const supplementaryColumns = [
    {
      title: '页码',
      dataIndex: 'page_number',
      key: 'page_number',
      width: 60,
      fixed: 'left' as const,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => (a.page_number || 0) - (b.page_number || 0),
      filters: getUniqueFilters('page_number'),
      onFilter: (value: any, record: SupplementaryRow) => String(record.page_number) === value,
      render: (val: number, record: SupplementaryRowWithConflict) => renderEditableCell('page_number', val, record, 'number', 60),
    },
    {
      title: '考试类型',
      dataIndex: 'exam_type',
      key: 'exam_type',
      width: 90,
      fixed: 'left' as const,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.exam_type.localeCompare(b.exam_type),
      filters: [
        { text: '物理类', value: '物理类' },
        { text: '历史类', value: '历史类' },
        { text: '理科', value: '理科' },
        { text: '文科', value: '文科' },
      ],
      onFilter: (value: any, record: SupplementaryRow) => record.exam_type === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('exam_type', val, record, 'text', 90),
    },
    {
      title: '招生类型',
      dataIndex: 'enrollment_type',
      key: 'enrollment_type',
      width: 130,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.enrollment_type.localeCompare(b.enrollment_type),
      filters: getUniqueFilters('enrollment_type'),
      onFilter: (value: any, record: SupplementaryRow) => record.enrollment_type === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('enrollment_type', val, record, 'text', 130),
    },
    {
      title: '院校代码',
      dataIndex: 'university_code',
      key: 'university_code',
      width: 90,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.university_code.localeCompare(b.university_code),
      filterSearch: true,
      filters: getUniqueFilters('university_code'),
      onFilter: (value: any, record: SupplementaryRow) => record.university_code === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('university_code', val, record, 'text', 90),
    },
    {
      title: '院校名称',
      dataIndex: 'university_name',
      key: 'university_name',
      width: 160,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.university_name.localeCompare(b.university_name),
      filterSearch: true,
      filters: getUniqueFilters('university_name'),
      onFilter: (value: any, record: SupplementaryRow) => record.university_name === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('university_name', val, record, 'text', 160),
    },
    {
      title: '专业组',
      dataIndex: 'major_group_code',
      key: 'major_group_code',
      width: 80,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.major_group_code.localeCompare(b.major_group_code),
      filters: getUniqueFilters('major_group_code'),
      onFilter: (value: any, record: SupplementaryRow) => record.major_group_code === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('major_group_code', val, record, 'text', 80),
    },
    {
      title: '组计划',
      dataIndex: 'major_group_plan',
      key: 'major_group_plan',
      width: 70,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.major_group_plan - b.major_group_plan,
      render: (val: number, record: SupplementaryRowWithConflict) => renderEditableCell('major_group_plan', val, record, 'number', 70),
    },
    {
      title: '专业代码',
      dataIndex: 'major_code',
      key: 'major_code',
      width: 90,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.major_code.localeCompare(b.major_code),
      filterSearch: true,
      filters: getUniqueFilters('major_code'),
      onFilter: (value: any, record: SupplementaryRow) => record.major_code === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('major_code', val, record, 'text', 90),
    },
    {
      title: '专业名称',
      dataIndex: 'major_name',
      key: 'major_name',
      width: 160,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.major_name.localeCompare(b.major_name),
      filterSearch: true,
      filters: getUniqueFilters('major_name'),
      onFilter: (value: any, record: SupplementaryRow) => record.major_name === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('major_name', val, record, 'text', 160),
    },
    {
      title: '专业备注',
      dataIndex: 'major_note',
      key: 'major_note',
      width: 130,
      render: (val: string, record: SupplementaryRowWithConflict) => {
        const rowKey = getSupplementaryRowKey(record);
        const isEditing = editingSupplementaryCell?.rowKey === rowKey && editingSupplementaryCell?.field === 'major_note';
        if (isEditing) {
          return (
            <Input
              size="small"
              defaultValue={val}
              autoFocus
              onBlur={(e) => {
                handleSupplementaryCellEdit(rowKey, 'major_note', e.target.value);
                setEditingSupplementaryCell(null);
              }}
              onPressEnter={(e) => {
                handleSupplementaryCellEdit(rowKey, 'major_note', (e.target as HTMLInputElement).value);
                setEditingSupplementaryCell(null);
              }}
              style={{ width: 120 }}
            />
          );
        }
        return (
          <Tooltip title={val}>
            <span
              style={{ cursor: 'pointer', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
              onClick={() => setEditingSupplementaryCell({ rowKey, field: 'major_note' })}
            >
              {val || '-'} <EditOutlined style={{ fontSize: 10, color: '#999' }} />
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '计划数',
      dataIndex: 'plan_count',
      key: 'plan_count',
      width: 70,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.plan_count - b.plan_count,
      render: (val: number, record: SupplementaryRowWithConflict) => renderEditableCell('plan_count', val, record, 'number', 70),
    },
    {
      title: '收费',
      dataIndex: 'tuition',
      key: 'tuition',
      width: 90,
      sorter: (a: SupplementaryRow, b: SupplementaryRow) => a.tuition.localeCompare(b.tuition),
      filters: getUniqueFilters('tuition'),
      onFilter: (value: any, record: SupplementaryRow) => record.tuition === value,
      render: (val: string, record: SupplementaryRowWithConflict) => renderEditableCell('tuition', val, record, 'text', 90),
    },
    {
      title: '来源',
      dataIndex: 'source_url',
      key: 'source_url',
      width: 60,
      render: (val: string) => val ? (
        <Tooltip title={val}>
          <a href={val} target="_blank" rel="noopener noreferrer">
            <LinkOutlined />
          </a>
        </Tooltip>
      ) : '-',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <Content style={{ padding: 24, maxWidth: 1600, margin: '0 auto', width: '100%' }}>
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

                {/* 多引擎校验选项（仅征集志愿） */}
                {dataType === 'supplementary' && (
                  <Card size="small" style={{ marginTop: 16, background: '#f0f5ff' }}>
                    <Row align="middle" gutter={16}>
                      <Col flex="auto">
                        <Space>
                          <ScanOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                          <Text strong>多引擎交叉校验</Text>
                          <Tag color="blue">推荐</Tag>
                          <Text type="secondary">使用多个 OCR 引擎同时识别，交叉比对确保数据准确</Text>
                        </Space>
                      </Col>
                      <Col>
                        <Radio.Group
                          value={multiEngineMode}
                          onChange={(e) => setMultiEngineMode(e.target.value)}
                          optionType="button"
                          size="small"
                        >
                          <Radio.Button value={false}>单引擎</Radio.Button>
                          <Radio.Button value={true}>多引擎</Radio.Button>
                        </Radio.Group>
                      </Col>
                    </Row>

                    {multiEngineMode && (
                      <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 4 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>选择 OCR 引擎（至少 2 个）</Text>
                        <Space wrap>
                          <Tag.CheckableTag
                            checked={engineOptions.enableBaidu}
                            onChange={(checked) => setEngineOptions(prev => ({ ...prev, enableBaidu: checked }))}
                            style={{ padding: '4px 12px', border: '1px solid #d9d9d9' }}
                          >
                            百度云 OCR
                          </Tag.CheckableTag>
                          <Tag.CheckableTag
                            checked={engineOptions.enablePaddleocr}
                            onChange={(checked) => setEngineOptions(prev => ({ ...prev, enablePaddleocr: checked }))}
                            style={{ padding: '4px 12px', border: '1px solid #d9d9d9' }}
                          >
                            PaddleOCR
                          </Tag.CheckableTag>
                          <Tag.CheckableTag
                            checked={engineOptions.enableRapid}
                            onChange={(checked) => setEngineOptions(prev => ({ ...prev, enableRapid: checked }))}
                            style={{ padding: '4px 12px', border: '1px solid #d9d9d9' }}
                          >
                            RapidOCR
                          </Tag.CheckableTag>
                          <Tag.CheckableTag
                            checked={engineOptions.enableAi}
                            onChange={(checked) => {
                              setEngineOptions(prev => ({ ...prev, enableAi: checked }));
                              if (checked && aiConfigs.length === 0) {
                                loadAiConfigs();
                              }
                            }}
                            style={{ padding: '4px 12px', border: '1px solid #d9d9d9' }}
                          >
                            AI 视觉模型
                          </Tag.CheckableTag>
                        </Space>

                        {engineOptions.enableAi && (
                          <div style={{ marginTop: 12, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                            <Radio.Group
                              value={aiConfigMode}
                              onChange={(e) => setAiConfigMode(e.target.value)}
                              size="small"
                              style={{ marginBottom: 8 }}
                            >
                              <Radio.Button value="saved">已保存配置</Radio.Button>
                              <Radio.Button value="manual">手动输入</Radio.Button>
                            </Radio.Group>

                            {aiConfigMode === 'saved' ? (
                              <Select
                                value={selectedAiConfig}
                                onChange={setSelectedAiConfig}
                                loading={loadingAiConfigs}
                                style={{ width: '100%' }}
                                placeholder="选择 AI 配置"
                                size="small"
                                options={aiConfigs.map(c => ({
                                  value: c.id,
                                  label: `${c.name}${c.isDefault ? ' (默认)' : ''}`,
                                }))}
                              />
                            ) : (
                              <Row gutter={8}>
                                <Col span={8}>
                                  <Input.Password
                                    value={aiApiKey}
                                    onChange={(e) => setAiApiKey(e.target.value)}
                                    placeholder="API Key"
                                    size="small"
                                  />
                                </Col>
                                <Col span={8}>
                                  <Input
                                    value={aiBaseUrl}
                                    onChange={(e) => setAiBaseUrl(e.target.value)}
                                    placeholder="API URL"
                                    size="small"
                                  />
                                </Col>
                                <Col span={8}>
                                  <Input
                                    value={aiModel}
                                    onChange={(e) => setAiModel(e.target.value)}
                                    placeholder="模型名称"
                                    size="small"
                                  />
                                </Col>
                              </Row>
                            )}
                          </div>
                        )}

                        <Alert
                          style={{ marginTop: 12 }}
                          message="多引擎校验说明"
                          description={
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              <li>多个引擎结果一致的数据自动通过</li>
                              <li>结果不一致的数据标记待人工审核</li>
                              <li>启用的引擎越多，校验越准确，但耗时也越长</li>
                            </ul>
                          }
                          type="info"
                          showIcon
                        />
                      </div>
                    )}
                  </Card>
                )}

                <Space>
                  <Button onClick={() => setCurrentStep(0)}>上一步</Button>
                  {dataType === 'supplementary' && multiEngineMode ? (
                    <Button
                      type="primary"
                      icon={<ScanOutlined />}
                      onClick={handleMultiEngineOcr}
                      loading={multiEngineLoading}
                    >
                      {multiEngineLoading ? '多引擎校验中...' : '开始多引擎校验'}
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<ScanOutlined />}
                      onClick={handleOcr}
                    >
                      开始 OCR 识别
                    </Button>
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
                      <Col span={4}>
                        <Statistic title="识别行数" value={supplementaryData.length} />
                      </Col>
                      <Col span={4}>
                        <Statistic title="院校数" value={(ocrResult as SupplementaryOcrResult).university_count} />
                      </Col>
                      <Col span={4}>
                        <Statistic
                          title="无冲突"
                          value={supplementaryData.filter(r => !r._hasConflict).length}
                          valueStyle={{ color: '#52c41a' }}
                          prefix={<CheckCircleOutlined />}
                        />
                      </Col>
                      <Col span={4}>
                        <Statistic
                          title="有冲突"
                          value={supplementaryData.filter(r => r._hasConflict).length}
                          valueStyle={{ color: supplementaryData.some(r => r._hasConflict) ? '#faad14' : '#999' }}
                          prefix={<ExclamationCircleOutlined />}
                        />
                      </Col>
                      <Col span={4}>
                        <Statistic
                          title="数据状态"
                          value={ocrResult.is_valid ? '校验通过' : `${ocrResult.errors.length} 个问题`}
                          prefix={ocrResult.is_valid ? <CheckCircleOutlined /> : <WarningOutlined />}
                          valueStyle={{
                            color: ocrResult.is_valid ? '#52c41a' : '#faad14',
                          }}
                        />
                      </Col>
                      <Col span={4}>
                        <Statistic
                          title="目标"
                          value={`${year} ${province}`}
                        />
                      </Col>
                    </Row>

                    {/* 多引擎校验结果摘要 */}
                    {multiEngineResult && (
                      <Card size="small" style={{ marginTop: 16, background: '#f0f5ff' }}>
                        <Row align="middle" gutter={16}>
                          <Col flex="auto">
                            <Space wrap>
                              <Text strong>多引擎校验结果</Text>
                              <Divider type="vertical" />
                              <Text type="secondary">使用引擎:</Text>
                              {multiEngineResult.engines_success.map(engine => (
                                <Tag key={engine} color="green">{engine}</Tag>
                              ))}
                              {Object.entries(multiEngineResult.engines_failed).map(([engine, error]) => (
                                <Tooltip key={engine} title={error}>
                                  <Tag color="red">{engine} (失败)</Tag>
                                </Tooltip>
                              ))}
                            </Space>
                          </Col>
                          <Col>
                            <Space>
                              <Tag color="green">高置信: {multiEngineResult.high_confidence}</Tag>
                              <Tag color="blue">中置信: {multiEngineResult.medium_confidence}</Tag>
                              <Tag color="orange">冲突: {multiEngineResult.conflicts}</Tag>
                            </Space>
                          </Col>
                        </Row>
                        {supplementaryData.some(r => r._hasConflict) && (
                          <Alert
                            style={{ marginTop: 12 }}
                            message="部分数据存在冲突"
                            description="表格中橙色背景的行表示有冲突，冲突字段会显示各引擎的不同值，点击可选择应用"
                            type="warning"
                            showIcon
                          />
                        )}
                      </Card>
                    )}

                    {ocrResult.errors.length > 0 && (
                      <Alert
                        style={{ marginTop: 16 }}
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
                      style={{ marginTop: 16 }}
                      dataSource={supplementaryData}
                      columns={[
                        // 置信度列（多引擎校验结果）
                        {
                          title: '状态',
                          key: 'confidence',
                          width: 80,
                          fixed: 'left' as const,
                          filters: [
                            { text: '高置信', value: 'high' },
                            { text: '中置信', value: 'medium' },
                            { text: '有冲突', value: 'conflict' },
                          ],
                          onFilter: (value: any, record: SupplementaryRowWithConflict) => record._confidence === value,
                          render: (_: any, record: SupplementaryRowWithConflict) => {
                            if (!record._confidence) {
                              return <Tag color="default">-</Tag>;
                            }
                            const colors: Record<string, string> = {
                              high: 'green',
                              medium: 'blue',
                              low: 'orange',
                              conflict: 'red',
                              single: 'default',
                            };
                            const labels: Record<string, string> = {
                              high: '高',
                              medium: '中',
                              low: '低',
                              conflict: '冲突',
                              single: '单源',
                            };
                            return (
                              <Tag color={colors[record._confidence] || 'default'}>
                                {record._hasConflict && <ExclamationCircleOutlined style={{ marginRight: 4 }} />}
                                {labels[record._confidence] || record._confidence}
                              </Tag>
                            );
                          },
                        },
                        ...supplementaryColumns.slice(0, -2), // 除了计划数和���费
                        {
                          title: '计划数',
                          dataIndex: 'plan_count',
                          key: 'plan_count',
                          width: 120,
                          sorter: (a: SupplementaryRowWithConflict, b: SupplementaryRowWithConflict) => a.plan_count - b.plan_count,
                          render: (val: number, record: SupplementaryRowWithConflict) => {
                            const rowKey = getSupplementaryRowKey(record);
                            // 检查是否有多引擎冲���
                            const fieldDiff = record._fieldDiffs?.find(d => d.field_name === 'plan_count');

                            // 有多引擎冲突时显示各引擎值
                            if (fieldDiff && !fieldDiff.is_consistent) {
                              return (
                                <Space direction="vertical" size={2}>
                                  <span style={{ fontWeight: 'bold' }}>{val}</span>
                                  <Space wrap size={2}>
                                    {Object.entries(fieldDiff.values).map(([engine, engineVal]) => (
                                      <Tooltip key={engine} title={`点击应用 ${engine} 的值`}>
                                        <Tag
                                          color={String(engineVal) === String(val) ? 'green' : 'orange'}
                                          style={{ cursor: 'pointer', fontSize: 10 }}
                                          onClick={() => handleApplyEngineValue(rowKey, 'plan_count', engineVal)}
                                        >
                                          {engine}: {String(engineVal)}
                                        </Tag>
                                      </Tooltip>
                                    ))}
                                  </Space>
                                </Space>
                              );
                            }

                            // 正常编辑模式
                            const isEditing = editingSupplementaryCell?.rowKey === rowKey && editingSupplementaryCell?.field === 'plan_count';
                            if (isEditing) {
                              return (
                                <InputNumber
                                  size="small"
                                  min={0}
                                  defaultValue={val}
                                  autoFocus
                                  onBlur={() => setEditingSupplementaryCell(null)}
                                  onChange={(v) => {
                                    if (v !== null) handleSupplementaryCellEdit(rowKey, 'plan_count', v);
                                  }}
                                  onPressEnter={() => setEditingSupplementaryCell(null)}
                                  style={{ width: 60 }}
                                />
                              );
                            }
                            return (
                              <span
                                style={{ cursor: 'pointer' }}
                                onClick={() => setEditingSupplementaryCell({ rowKey, field: 'plan_count' })}
                              >
                                {val ?? '-'} <EditOutlined style={{ fontSize: 10, color: '#999' }} />
                              </span>
                            );
                          },
                        },
                        {
                          title: '收费',
                          dataIndex: 'tuition',
                          key: 'tuition',
                          width: 120,
                          sorter: (a: SupplementaryRowWithConflict, b: SupplementaryRowWithConflict) => a.tuition.localeCompare(b.tuition),
                          render: (val: string, record: SupplementaryRowWithConflict) => {
                            const rowKey = getSupplementaryRowKey(record);
                            // 检查是否有多引擎冲突
                            const fieldDiff = record._fieldDiffs?.find(d => d.field_name === 'tuition');

                            // 有多引擎冲突时显示各引擎值
                            if (fieldDiff && !fieldDiff.is_consistent) {
                              return (
                                <Space direction="vertical" size={2}>
                                  <span style={{ fontWeight: 'bold' }}>{val || '-'}</span>
                                  <Space wrap size={2}>
                                    {Object.entries(fieldDiff.values).map(([engine, engineVal]) => (
                                      <Tooltip key={engine} title={`点击应用 ${engine} 的值`}>
                                        <Tag
                                          color={String(engineVal) === String(val) ? 'green' : 'orange'}
                                          style={{ cursor: 'pointer', fontSize: 10 }}
                                          onClick={() => handleApplyEngineValue(rowKey, 'tuition', engineVal)}
                                        >
                                          {engine}: {String(engineVal)}
                                        </Tag>
                                      </Tooltip>
                                    ))}
                                  </Space>
                                </Space>
                              );
                            }

                            // 正常编辑模式
                            const isEditing = editingSupplementaryCell?.rowKey === rowKey && editingSupplementaryCell?.field === 'tuition';
                            if (isEditing) {
                              return (
                                <Input
                                  size="small"
                                  defaultValue={val}
                                  autoFocus
                                  onBlur={(e) => {
                                    handleSupplementaryCellEdit(rowKey, 'tuition', e.target.value);
                                    setEditingSupplementaryCell(null);
                                  }}
                                  onPressEnter={(e) => {
                                    handleSupplementaryCellEdit(rowKey, 'tuition', (e.target as HTMLInputElement).value);
                                    setEditingSupplementaryCell(null);
                                  }}
                                  style={{ width: 80 }}
                                />
                              );
                            }
                            return (
                              <span
                                style={{ cursor: 'pointer' }}
                                onClick={() => setEditingSupplementaryCell({ rowKey, field: 'tuition' })}
                              >
                                {val || '-'} <EditOutlined style={{ fontSize: 10, color: '#999' }} />
                              </span>
                            );
                          },
                        },
                      ]}
                      rowKey={(r) => `${r.university_code}_${r.major_group_code}_${r.major_code}_${r.major_name}`}
                      size="small"
                      pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                      scroll={{ x: 1200, y: 400 }}
                      rowClassName={(record: SupplementaryRowWithConflict) => {
                        return record._hasConflict ? 'row-conflict' : '';
                      }}
                    />
                  </>
                )}
                <style jsx global>{`
                  .row-error td { background: #fff2f0 !important; }
                  .row-error:hover td { background: #ffebe8 !important; }
                  .row-conflict td { background: #fff7e6 !important; }
                  .row-conflict:hover td { background: #ffe7ba !important; }
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
