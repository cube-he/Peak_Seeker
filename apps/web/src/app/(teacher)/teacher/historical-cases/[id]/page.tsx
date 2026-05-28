'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Spin, Empty, Tag, Button, Alert } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, FileTextOutlined, PictureOutlined } from '@ant-design/icons';
import { historicalCasesApi } from '@/services/historical-cases-api';

const EXAM_TYPE_LABEL: Record<string, string> = { PHYSICS: '物理类', HISTORY: '历史类' };

const CATEGORY_LABEL: Record<string, string> = {
  consultation: '咨询单',
  submission_screenshot: '志愿填报截图',
  admission_proof: '录取凭证',
  other: '其他',
};

export default function HistoricalCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['historical-case', id],
    queryFn: () => historicalCasesApi.getById(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <Spin />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Alert type="error" message="案例不存在或无权访问" />
        <Button className="mt-3" onClick={() => router.push('/teacher/historical-cases')}>
          <ArrowLeftOutlined /> 返回列表
        </Button>
      </div>
    );
  }

  const ar = data.admissionResult;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/teacher/historical-cases')}>
          返回
        </Button>
        <h1 className="m-0 font-serif text-xl font-semibold">
          {data.user.realName ?? data.user.username}
        </h1>
        <Tag color="default">{data.examYear} 届</Tag>
        {data.examType ? <Tag>{EXAM_TYPE_LABEL[data.examType]}</Tag> : null}
      </div>

      {/* 基本信息 */}
      <Card title="基本信息" size="small">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
          <Descriptions.Item label="性别">{data.user.gender ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="选科">
            {data.firstChoice ?? '--'} / {Array.isArray(data.reChoices) ? data.reChoices.join('/') : '--'}
          </Descriptions.Item>
          <Descriptions.Item label="高考总分">{data.totalScore ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="省排名">{data.provincialRank ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="户籍">{data.county ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="负责老师">
            {data.teacher?.user.realName ?? data.teacher?.user.username ?? '--'}
          </Descriptions.Item>
          <Descriptions.Item label="政治面貌">{data.politicalStatus ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="身高/体重">
            {data.height ?? '--'} cm / {data.weight ?? '--'} kg
          </Descriptions.Item>
          <Descriptions.Item label="视力">
            左 {data.visionLeft ?? '--'} / 右 {data.visionRight ?? '--'}
          </Descriptions.Item>
          <Descriptions.Item label="优先策略">{data.priorityMode ?? '--'}</Descriptions.Item>
          <Descriptions.Item label="意向地区" span={2}>
            {Array.isArray(data.preferredProvinces) && data.preferredProvinces.length > 0
              ? data.preferredProvinces.join('、')
              : '--'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 录取结果 */}
      <Card
        title="录取结果"
        size="small"
        className={ar ? 'border-safe' : ''}
      >
        {!ar ? (
          <Empty description="无录取记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
            <Descriptions.Item label="录取大学" span={2}>
              <span className="font-medium text-safe">{ar.admittedUniName}</span>
            </Descriptions.Item>
            <Descriptions.Item label="批次">
              <Tag color="blue">{ar.batchName ?? '--'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="录取最低分">{ar.admittedMinScore ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="录取最低位次">{ar.admittedMinRank ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="分差">
              {ar.scoreDiff == null ? (
                '--'
              ) : (
                <span className={ar.scoreDiff >= 0 ? 'text-safe' : 'text-rush'}>
                  {ar.scoreDiff > 0 ? `+${ar.scoreDiff}` : ar.scoreDiff} 分
                </span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="第几志愿被录取">{ar.sequenceNo ?? '--'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* 方案 */}
      {data.volunteerPlans.length > 0 ? (
        <Card title="志愿方案" size="small">
          <ul className="m-0 list-none space-y-2 p-0">
            {data.volunteerPlans.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-border-subtle bg-surface px-3 py-2"
              >
                <p className="m-0 text-sm font-medium">{p.name}</p>
                <p className="m-0 text-xs text-text-muted">
                  {p.batchName ?? '--'} · 状态: {p.status}
                  {p.versionNote ? ` · ${p.versionNote}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 附件 */}
      <Card title="附件" size="small">
        {data.attachments.length === 0 ? (
          <Empty description="无附件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {data.attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-text-muted">
                    {a.mimeType?.startsWith('image/') ? <PictureOutlined /> : <FileTextOutlined />}
                  </span>
                  <div>
                    <p className="m-0 text-sm">{CATEGORY_LABEL[a.category] ?? a.category}</p>
                    <p className="m-0 text-xs text-text-muted">
                      {a.originalName}
                      {a.fileSize ? ` · ${(a.fileSize / 1024).toFixed(1)} KB` : ''}
                    </p>
                  </div>
                </div>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  href={historicalCasesApi.attachmentDownloadUrl(a.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  下载
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
