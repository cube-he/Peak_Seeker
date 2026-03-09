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
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  checkImportHealth,
  fetchPage,
  runOcr,
  saveImportData,
  saveSupplementaryData,
  getImportStats,
  type FetchPageResult,
  type OcrResult,
  type SupplementaryOcrResult,
  type ScoreRow,
  type SupplementaryRow,
  type ImportStats,
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
      const result = await runOcr({
        imageUrls: fetchResult.image_urls,
        dataType,
        year,
        province,
        examType,
        batch,
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
    { title: '考试类型', dataIndex: 'exam_type', key: 'exam_type', width: 90 },
    { title: '院校代码', dataIndex: 'university_code', key: 'university_code', width: 90 },
    { title: '院校名称', dataIndex: 'university_name', key: 'university_name', width: 180 },
    { title: '专业代码', dataIndex: 'major_code', key: 'major_code', width: 80 },
    { title: '专业名称', dataIndex: 'major_name', key: 'major_name', width: 180 },
    { title: '计划数', dataIndex: 'plan_count', key: 'plan_count', width: 70 },
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
                    icon={<ScanOutlined />}
                    onClick={handleOcr}
                  >
                    开始 OCR 识别
                  </Button>
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
                      <Col span={6}>
                        <Statistic title="识别行数" value={supplementaryData.length} />
                      </Col>
                      <Col span={6}>
                        <Statistic title="院校数" value={(ocrResult as SupplementaryOcrResult).university_count} />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="数据状态"
                          value={ocrResult.is_valid ? '校验通过' : `${ocrResult.errors.length} 个问题`}
                          prefix={ocrResult.is_valid ? <CheckCircleOutlined /> : <WarningOutlined />}
                          valueStyle={{
                            color: ocrResult.is_valid ? '#52c41a' : '#faad14',
                          }}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="目标"
                          value={`${year} ${province} ${batch}`}
                        />
                      </Col>
                    </Row>

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
                      rowKey={(r) => `${r.university_code}_${r.major_code}_${r.major_name}`}
                      size="small"
                      pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
                      scroll={{ y: 400 }}
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
