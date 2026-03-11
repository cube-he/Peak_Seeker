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
  RobotOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  checkImportHealth,
  fetchPage,
  runOcr,
  runAiVerifySingle,
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
  type VerifyStatus,
  type MultiEngineValidationResponse,
  type RecordValidationResult,
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

  // AI 校验相关
  const [aiConfigMode, setAiConfigMode] = useState<'manual' | 'saved'>('saved');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.deepseek.com/v1');
  const [aiModel, setAiModel] = useState('deepseek-chat');
  const [aiVerifying, setAiVerifying] = useState(false);
  const [aiVerifyProgress, setAiVerifyProgress] = useState({ current: 0, total: 0 });
  const [aiDiffs, setAiDiffs] = useState<Map<string, { field: string; ocrValue: any; aiValue: any }[]>>(new Map());
  // 新增：跟踪每行的校验状态
  const [aiVerifyStatus, setAiVerifyStatus] = useState<Map<string, VerifyStatus>>(new Map());
  const [showAiConfig, setShowAiConfig] = useState(false);

  // 本地 AI 配置
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [selectedAiConfig, setSelectedAiConfig] = useState<string>('');
  const [loadingAiConfigs, setLoadingAiConfigs] = useState(false);

  // 记录每张图片识别的数据行数（用于筛选有数据的图片）
  const [imageDataCounts, setImageDataCounts] = useState<number[]>([]);

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
  const [pendingReviewData, setPendingReviewData] = useState<RecordValidationResult[]>([]);

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
    setAiDiffs(new Map()); // 清空之前的 AI 差异标记
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
        // 记录每张图片的数据行数（后端需要返回这个信息）
        if ((suppResult as any).image_data_counts) {
          setImageDataCounts((suppResult as any).image_data_counts);
        }
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

  // AI 校验（在 OCR 结果基础上逐张验证）
  const handleAiVerify = async () => {
    if (!fetchResult || supplementaryData.length === 0) return;

    // 检查 AI 配置
    if (aiConfigMode === 'saved' && !selectedAiConfig) {
      message.error('请先选择 AI 配置');
      return;
    }
    if (aiConfigMode === 'manual' && !aiApiKey) {
      message.error('请先输入 API Key');
      return;
    }

    // 根据 imageDataCounts 把 OCR 数据按图片分组
    const imageOcrDataMap: Map<number, typeof supplementaryData> = new Map();
    if (imageDataCounts.length > 0) {
      let dataIndex = 0;
      for (let imgIdx = 0; imgIdx < imageDataCounts.length; imgIdx++) {
        const count = imageDataCounts[imgIdx];
        if (count > 0) {
          imageOcrDataMap.set(imgIdx, supplementaryData.slice(dataIndex, dataIndex + count));
        }
        dataIndex += count;
      }
    }

    // 筛选有数据的图片
    const imagesWithData: { url: string; index: number; ocrData: typeof supplementaryData }[] = [];
    fetchResult.image_urls.forEach((url, index) => {
      if (imageDataCounts.length > 0) {
        const ocrData = imageOcrDataMap.get(index);
        if (ocrData && ocrData.length > 0) {
          imagesWithData.push({ url, index, ocrData });
        }
      } else {
        // 没有详细信息时，假设从第2张开始有数据，传入全部数据
        if (index >= 1) {
          imagesWithData.push({ url, index, ocrData: supplementaryData });
        }
      }
    });

    if (imagesWithData.length === 0) {
      message.warning('没有找到包含数据的图片');
      return;
    }

    setAiVerifying(true);
    setAiVerifyProgress({ current: 0, total: imagesWithData.length });

    // 使用本地变量累积差异和状态，避免 React 状态异步更新问题
    const allDiffs = new Map<string, { field: string; ocrValue: any; aiValue: any }[]>();
    const allStatus = new Map<string, VerifyStatus>();
    setAiDiffs(allDiffs);
    setAiVerifyStatus(allStatus);

    let successCount = 0;
    let failCount = 0;
    let timeoutCount = 0;
    let matchedCount = 0;
    let conflictCount = 0;

    // 逐张调用 AI 验证
    for (let i = 0; i < imagesWithData.length; i++) {
      const { url, ocrData } = imagesWithData[i];
      setAiVerifyProgress({ current: i + 1, total: imagesWithData.length });

      // 调用单张图片的 AI 验证，传入该图片的 OCR 数据
      const aiParams: Parameters<typeof runAiVerifySingle>[0] = {
        imageUrl: url,
        ocrData,
        year,
        province,
        examType,
        batch,
      };

      if (aiConfigMode === 'saved' && selectedAiConfig) {
        aiParams.aiConfigId = selectedAiConfig;
      } else {
        aiParams.aiApiKey = aiApiKey;
        aiParams.aiBaseUrl = aiBaseUrl;
        aiParams.aiModel = aiModel;
      }

      try {
        const aiResult = await runAiVerifySingle(aiParams);

        // 检查是否有错误（超时等）
        if (aiResult.error_message) {
          if (aiResult.error_message.includes('超时')) {
            timeoutCount++;
            message.warning(`第 ${i + 1} 张图片 AI 校验超时`);
          } else {
            failCount++;
            message.warning(`第 ${i + 1} 张图片: ${aiResult.error_message}`);
          }

          // 第一张图片就失败，提示用户并询问是否继续
          if (i === 0 && (aiResult.summary.timeout > 0 || aiResult.summary.error > 0)) {
            const shouldContinue = window.confirm(
              'AI 校验第一张图片就失败了，可能是配置问题。\n\n' +
              '常见原因：\n' +
              '1. 模型不支持图片识别（如 qwen-turbo 不支持，需要用 qwen-vl-plus）\n' +
              '2. API Key 无效或过期\n' +
              '3. API 调用超时\n\n' +
              '是否继续尝试其他图片？'
            );
            if (!shouldContinue) {
              setAiVerifying(false);
              return;
            }
          }
        } else {
          successCount++;
        }

        // 统计校验结果
        matchedCount += aiResult.summary.matched || 0;
        conflictCount += aiResult.summary.conflict || 0;

        // 处理校验结果，记录每行状态和冲突
        for (const row of aiResult.verified_rows) {
          const rowKey = `${row.data.university_code}_${row.data.major_group_code}_${row.data.major_code}`;

          // 记录状态
          allStatus.set(rowKey, row.status);

          // 如果是冲突，提取差异详情
          if (row.status === 'conflict' && row.diff_fields && row.diff_fields.length > 0) {
            const diffs: { field: string; ocrValue: any; aiValue: any }[] = [];

            for (const diffField of row.diff_fields) {
              // 解析 diff_fields 格式: "plan_count(OCR:1, AI:2)"
              const match = diffField.match(/^(\w+)\(OCR:(.+), AI:(.+)\)$/);
              if (match) {
                const [, field, ocrValue, aiValue] = match;
                diffs.push({ field, ocrValue, aiValue });
              }
            }

            if (diffs.length > 0) {
              allDiffs.set(rowKey, diffs);
            }
          }
        }

        // 每处理完一张图片，更新 UI 显示
        setAiDiffs(new Map(allDiffs));
        setAiVerifyStatus(new Map(allStatus));

        // 实时提示进度
        const imgSummary = aiResult.summary;
        message.info(
          `第 ${i + 1} 张: 一致 ${imgSummary.matched || 0}, 冲突 ${imgSummary.conflict || 0}, ` +
          `仅OCR ${imgSummary.ocr_only || 0}, 仅AI ${imgSummary.ai_only || 0}`
        );

      } catch (e: any) {
        failCount++;
        const errMsg = e?.response?.data?.message || e?.message || '未知错误';
        message.error(`第 ${i + 1} 张图片 AI 校验失败: ${errMsg}`);

        // 第一张就失败，询问是否继续
        if (i === 0) {
          const shouldContinue = window.confirm(
            `AI 校验第一张图片就出错了: ${errMsg}\n\n是否继续尝试其他图片？`
          );
          if (!shouldContinue) {
            setAiVerifying(false);
            return;
          }
        }
      }
    }

    // 最终汇总
    setAiVerifying(false);
    const diffCount = allDiffs.size;
    const totalImages = imagesWithData.length;

    if (failCount + timeoutCount === totalImages) {
      message.error('所有图片 AI 校验都失败了，请检查 AI 配置');
    } else {
      const statusParts = [];
      if (successCount > 0) statusParts.push(`成功 ${successCount}`);
      if (timeoutCount > 0) statusParts.push(`超时 ${timeoutCount}`);
      if (failCount > 0) statusParts.push(`失败 ${failCount}`);

      if (diffCount > 0) {
        message.warning(
          `AI 校验完成（${statusParts.join(', ')}），` +
          `一致 ${matchedCount} 条，冲突 ${conflictCount} 条，请人工复核`
        );
      } else if (successCount > 0) {
        message.success(`AI 校验完成（${statusParts.join(', ')}），全部一致，无冲突`);
      }
    }
  };

  // 应用 AI 结果到指定行
  const handleApplyAiValue = (rowKey: string, field: string, aiValue: any) => {
    setSupplementaryData((prev) =>
      prev.map((row) => {
        const key = `${row.university_code}_${row.major_group_code}_${row.major_code}`;
        if (key === rowKey) {
          return { ...row, [field]: aiValue };
        }
        return row;
      })
    );

    // 从差异列表中移除该字段
    setAiDiffs((prev) => {
      const newDiffs = new Map(prev);
      const rowDiffs = newDiffs.get(rowKey);
      if (rowDiffs) {
        const updatedDiffs = rowDiffs.filter((d) => d.field !== field);
        if (updatedDiffs.length === 0) {
          newDiffs.delete(rowKey);
        } else {
          newDiffs.set(rowKey, updatedDiffs);
        }
      }
      return newDiffs;
    });

    message.success('已应用 AI 结果');
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
    setPendingReviewData([]);

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

      // 设置数据
      if (result.approved_data.length > 0) {
        setSupplementaryData(result.approved_data);
      }
      if (result.pending_review_data.length > 0) {
        setPendingReviewData(result.pending_review_data);
      }

      setCurrentStep(2);
      setOcrResult({
        total_rows: result.total_records,
        university_count: new Set(result.approved_data.map(r => r.university_code)).size,
        major_group_count: 0,
        is_valid: result.is_valid,
        errors: result.errors,
        data: result.approved_data,
      } as SupplementaryOcrResult);

      // 显示结果摘要
      if (result.pending_review_count > 0) {
        message.warning(
          `多引擎校验完成: ${result.auto_approved_count} 条自动通过, ${result.pending_review_count} 条待人工审核`
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

  // 审核通过待审核数据
  const handleApproveReviewItem = (recordKey: string) => {
    const item = pendingReviewData.find(r => r.record_key === recordKey);
    if (!item) return;

    // 将待审核数据添加到已通过数据
    const newRow: SupplementaryRow = {
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
    };

    setSupplementaryData(prev => [...prev, newRow]);
    setPendingReviewData(prev => prev.filter(r => r.record_key !== recordKey));
    message.success('已通过审核');
  };

  // 拒绝待审核数据
  const handleRejectReviewItem = (recordKey: string) => {
    setPendingReviewData(prev => prev.filter(r => r.record_key !== recordKey));
    message.info('已拒绝该条数据');
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
    setAiDiffs(new Map());
    setAiVerifying(false);
    setAiVerifyProgress({ current: 0, total: 0 });
    setImageDataCounts([]);
    setShowAiConfig(false);
    // 多引擎相关
    setMultiEngineMode(false);
    setMultiEngineResult(null);
    setMultiEngineLoading(false);
    setPendingReviewData([]);
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
    { title: '页码', dataIndex: 'page_number', key: 'page_number', width: 50, fixed: 'left' as const },
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
                      <Col span={3}>
                        <Statistic title="识别行数" value={supplementaryData.length + pendingReviewData.length} />
                      </Col>
                      <Col span={3}>
                        <Statistic title="院校数" value={(ocrResult as SupplementaryOcrResult).university_count} />
                      </Col>
                      <Col span={3}>
                        <Statistic
                          title="自动通过"
                          value={supplementaryData.length}
                          valueStyle={{ color: '#52c41a' }}
                          prefix={<CheckCircleOutlined />}
                        />
                      </Col>
                      <Col span={3}>
                        <Statistic
                          title="待审核"
                          value={pendingReviewData.length}
                          valueStyle={{ color: pendingReviewData.length > 0 ? '#faad14' : '#999' }}
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
                          title="AI 差异"
                          value={aiDiffs.size > 0 ? `${aiDiffs.size} 处` : (aiVerifying ? '校验中...' : '未校验')}
                          prefix={aiDiffs.size > 0 ? <ExclamationCircleOutlined /> : <RobotOutlined />}
                          valueStyle={{ color: aiDiffs.size > 0 ? '#ff4d4f' : '#999' }}
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
                      </Card>
                    )}

                    {/* 待审核数据区域 */}
                    {pendingReviewData.length > 0 && (
                      <Card
                        size="small"
                        title={
                          <Space>
                            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                            <span>待人工审核 ({pendingReviewData.length} 条)</span>
                          </Space>
                        }
                        style={{ marginTop: 16, borderColor: '#faad14' }}
                      >
                        <Alert
                          message="以下数据在多个 OCR 引擎间存在差异，请人工确认"
                          type="warning"
                          showIcon
                          style={{ marginBottom: 12 }}
                        />
                        <Table
                          dataSource={pendingReviewData}
                          rowKey="record_key"
                          size="small"
                          pagination={{ pageSize: 10 }}
                          columns={[
                            {
                              title: '置信度',
                              dataIndex: 'confidence',
                              width: 80,
                              render: (val: string) => {
                                const colors: Record<string, string> = {
                                  high: 'green',
                                  medium: 'blue',
                                  low: 'orange',
                                  conflict: 'red',
                                  single: 'default',
                                };
                                return <Tag color={colors[val] || 'default'}>{val}</Tag>;
                              },
                            },
                            {
                              title: '院校',
                              key: 'university',
                              width: 150,
                              render: (_: any, record: RecordValidationResult) => (
                                <span>{String(record.merged_data.university_code || '')} {String(record.merged_data.university_name || '')}</span>
                              ),
                            },
                            {
                              title: '专业',
                              key: 'major',
                              width: 200,
                              render: (_: any, record: RecordValidationResult) => (
                                <span>{String(record.merged_data.major_code || '')} {String(record.merged_data.major_name || '')}</span>
                              ),
                            },
                            {
                              title: '计划数',
                              key: 'plan_count',
                              width: 80,
                              render: (_: any, record: RecordValidationResult) => String(record.merged_data.plan_count ?? ''),
                            },
                            {
                              title: '冲突字段',
                              dataIndex: 'conflict_fields',
                              width: 150,
                              render: (fields: string[]) => (
                                <Space wrap size={4}>
                                  {fields.map(f => <Tag key={f} color="red">{f}</Tag>)}
                                </Space>
                              ),
                            },
                            {
                              title: '各引擎值',
                              dataIndex: 'field_diffs',
                              width: 200,
                              render: (diffs: any[]) => (
                                <Space direction="vertical" size={2}>
                                  {diffs?.slice(0, 2).map((d, i) => (
                                    <Text key={i} type="secondary" style={{ fontSize: 12 }}>
                                      {d.field_name}: {Object.entries(d.values).map(([k, v]) => `${k}=${v}`).join(', ')}
                                    </Text>
                                  ))}
                                </Space>
                              ),
                            },
                            {
                              title: '来源',
                              dataIndex: 'engine_sources',
                              width: 120,
                              render: (sources: string[]) => (
                                <Space wrap size={4}>
                                  {sources.map(s => <Tag key={s} color="blue">{s}</Tag>)}
                                </Space>
                              ),
                            },
                            {
                              title: '操作',
                              key: 'action',
                              width: 120,
                              fixed: 'right' as const,
                              render: (_: any, record: RecordValidationResult) => (
                                <Space>
                                  <Button
                                    type="primary"
                                    size="small"
                                    onClick={() => handleApproveReviewItem(record.record_key)}
                                  >
                                    通过
                                  </Button>
                                  <Button
                                    size="small"
                                    danger
                                    onClick={() => handleRejectReviewItem(record.record_key)}
                                  >
                                    拒绝
                                  </Button>
                                </Space>
                              ),
                            },
                          ]}
                          scroll={{ x: 1100 }}
                        />
                      </Card>
                    )}
                    <Card size="small" style={{ marginTop: 16, background: '#f6f8fa' }}>
                      <Row align="middle" gutter={16}>
                        <Col flex="auto">
                          <Space>
                            <RobotOutlined style={{ fontSize: 18, color: '#1890ff' }} />
                            <Text strong>AI 校验</Text>
                            <Text type="secondary">使用 AI 对 OCR 结果进行二次验证，标记差异</Text>
                          </Space>
                        </Col>
                        <Col>
                          <Space>
                            <Button
                              size="small"
                              icon={<SettingOutlined />}
                              onClick={() => {
                                setShowAiConfig(!showAiConfig);
                                if (!showAiConfig && aiConfigs.length === 0) {
                                  loadAiConfigs();
                                }
                              }}
                            >
                              配置
                            </Button>
                            <Button
                              type="primary"
                              icon={<RobotOutlined />}
                              loading={aiVerifying}
                              onClick={handleAiVerify}
                              disabled={aiVerifying}
                            >
                              {aiVerifying
                                ? `校验中 ${aiVerifyProgress.current}/${aiVerifyProgress.total}`
                                : '开始 AI 校验'}
                            </Button>
                          </Space>
                        </Col>
                      </Row>

                      {/* AI 配置面板 */}
                      {showAiConfig && (
                        <div style={{ marginTop: 16, padding: 16, background: '#fff', borderRadius: 4 }}>
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
                                <Select
                                  value={selectedAiConfig}
                                  onChange={setSelectedAiConfig}
                                  loading={loadingAiConfigs}
                                  style={{ width: '100%' }}
                                  placeholder="选择已保存的 AI 配置"
                                  options={aiConfigs.map(c => ({
                                    value: c.id,
                                    label: `${c.name}${c.isDefault ? ' (默认)' : ''}`,
                                  }))}
                                />
                              </Col>
                              <Col span={8}>
                                <Space>
                                  <Button onClick={loadAiConfigs} loading={loadingAiConfigs}>
                                    刷新
                                  </Button>
                                  <Link href="/ai-config">
                                    <Button type="link" size="small">管理配置</Button>
                                  </Link>
                                </Space>
                              </Col>
                            </Row>
                          ) : (
                            <Row gutter={16}>
                              <Col span={8}>
                                <Input.Password
                                  value={aiApiKey}
                                  onChange={(e) => setAiApiKey(e.target.value)}
                                  placeholder="API Key: sk-xxx..."
                                />
                              </Col>
                              <Col span={8}>
                                <Select
                                  value={aiBaseUrl}
                                  onChange={setAiBaseUrl}
                                  style={{ width: '100%' }}
                                  options={[
                                    { value: 'https://api.deepseek.com/v1', label: 'DeepSeek' },
                                    { value: 'https://api.openai.com/v1', label: 'OpenAI' },
                                    { value: 'https://api.moonshot.cn/v1', label: 'Moonshot' },
                                  ]}
                                />
                              </Col>
                              <Col span={8}>
                                <Input
                                  value={aiModel}
                                  onChange={(e) => setAiModel(e.target.value)}
                                  placeholder="模型: deepseek-chat"
                                />
                              </Col>
                            </Row>
                          )}
                        </div>
                      )}

                      {/* AI 校验进度 */}
                      {aiVerifying && (
                        <div style={{ marginTop: 12 }}>
                          <Text type="secondary">
                            正在校验第 {aiVerifyProgress.current} / {aiVerifyProgress.total} 张图片...
                          </Text>
                        </div>
                      )}

                      {/* AI 差异摘要 */}
                      {aiDiffs.size > 0 && !aiVerifying && (
                        <Alert
                          style={{ marginTop: 12 }}
                          message={`发现 ${aiDiffs.size} 处差异`}
                          description="表格中已用颜色标记差异字段，点击 AI 值可应用"
                          type="warning"
                          showIcon
                        />
                      )}
                    </Card>

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
                        // AI 校验状态列
                        {
                          title: 'AI校验',
                          key: 'ai_status',
                          width: 70,
                          fixed: 'left' as const,
                          render: (_: any, record: SupplementaryRow) => {
                            const rowKey = `${record.university_code}_${record.major_group_code}_${record.major_code}`;
                            const status = aiVerifyStatus.get(rowKey);
                            if (!status) {
                              return <Tag color="default"><QuestionCircleOutlined /> 未校验</Tag>;
                            }
                            switch (status) {
                              case 'matched':
                                return <Tag color="success"><CheckCircleOutlined /> 一致</Tag>;
                              case 'conflict':
                                return <Tag color="error"><ExclamationCircleOutlined /> 冲突</Tag>;
                              case 'ocr_only':
                                return <Tag color="warning"><WarningOutlined /> 仅OCR</Tag>;
                              case 'ai_only':
                                return <Tag color="blue"><RobotOutlined /> 仅AI</Tag>;
                              case 'timeout':
                                return <Tag color="orange"><ClockCircleOutlined /> 超时</Tag>;
                              case 'error':
                                return <Tag color="red"><CloseCircleOutlined /> 错误</Tag>;
                              default:
                                return <Tag color="default">{status}</Tag>;
                            }
                          },
                        },
                        ...supplementaryColumns.slice(0, -2), // 除了计划数和收费
                        {
                          title: '计划数',
                          dataIndex: 'plan_count',
                          key: 'plan_count',
                          width: 100,
                          render: (val: number, record: SupplementaryRow) => {
                            const rowKey = `${record.university_code}_${record.major_group_code}_${record.major_code}`;
                            const diffs = aiDiffs.get(rowKey);
                            const diff = diffs?.find(d => d.field === 'plan_count');
                            if (diff) {
                              return (
                                <Space size={4}>
                                  <span style={{ color: '#ff4d4f', textDecoration: 'line-through' }}>{diff.ocrValue}</span>
                                  <Tooltip title="点击应用 AI 结果">
                                    <Tag
                                      color="green"
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => handleApplyAiValue(rowKey, 'plan_count', diff.aiValue)}
                                    >
                                      {diff.aiValue}
                                    </Tag>
                                  </Tooltip>
                                </Space>
                              );
                            }
                            return val;
                          },
                        },
                        {
                          title: '收费',
                          dataIndex: 'tuition',
                          key: 'tuition',
                          width: 100,
                          render: (val: string, record: SupplementaryRow) => {
                            const rowKey = `${record.university_code}_${record.major_group_code}_${record.major_code}`;
                            const diffs = aiDiffs.get(rowKey);
                            const diff = diffs?.find(d => d.field === 'tuition');
                            if (diff) {
                              return (
                                <Space size={4}>
                                  <span style={{ color: '#ff4d4f', textDecoration: 'line-through' }}>{diff.ocrValue}</span>
                                  <Tooltip title="点击应用 AI 结果">
                                    <Tag
                                      color="green"
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => handleApplyAiValue(rowKey, 'tuition', diff.aiValue)}
                                    >
                                      {diff.aiValue}
                                    </Tag>
                                  </Tooltip>
                                </Space>
                              );
                            }
                            return val;
                          },
                        },
                      ]}
                      rowKey={(r) => `${r.university_code}_${r.major_group_code}_${r.major_code}_${r.major_name}`}
                      size="small"
                      pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                      scroll={{ x: 1200, y: 400 }}
                      rowClassName={(record) => {
                        const rowKey = `${record.university_code}_${record.major_group_code}_${record.major_code}`;
                        return aiDiffs.has(rowKey) ? 'row-diff' : '';
                      }}
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
