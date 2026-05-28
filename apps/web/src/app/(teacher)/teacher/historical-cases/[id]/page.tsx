'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Card, Descriptions, Spin, Empty, Tag, Button, Alert, Image, Modal } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons';
import { historicalCasesApi } from '@/services/historical-cases-api';

const EXAM_TYPE_LABEL: Record<string, string> = { PHYSICS: '物理类', HISTORY: '历史类' };

const CATEGORY_LABEL: Record<string, string> = {
  consultation: '咨询单',
  submission_screenshot: '志愿填报截图',
  admission_proof: '录取凭证',
  other: '其他',
};

// 附件 endpoint 现在双重鉴权 (Authorization header 或 access_token cookie),
// 浏览器原生 <img src> / <iframe src> 同源请求自动带 HttpOnly cookie 即可.
function ImageAttachment({ previewUrl, alt }: { previewUrl: string; alt: string }) {
  return (
    <Image
      src={previewUrl}
      alt={alt}
      width={36}
      height={36}
      style={{ objectFit: 'cover', borderRadius: 4 }}
      preview={{ src: previewUrl, mask: <EyeOutlined /> }}
    />
  );
}

function PdfPreviewModal({
  preview,
  onClose,
}: {
  preview: { url: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!preview}
      title={preview?.name}
      width="80vw"
      style={{ top: 20 }}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      {preview ? (
        <iframe
          src={preview.url}
          title={preview.name}
          style={{ width: '100%', height: '80vh', border: 'none' }}
        />
      ) : null}
    </Modal>
  );
}

export default function HistoricalCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

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
              {ar.admittedUniId ? (
                <Link
                  href={`/universities/${ar.admittedUniId}`}
                  className="font-medium text-safe"
                >
                  {ar.admittedUniName} →
                </Link>
              ) : (
                <span className="font-medium text-safe">{ar.admittedUniName}</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="批次">
              <Tag color="blue">{ar.batchName ?? '--'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="录取专业组">
              {ar.admittedMajorGroupCode ? (
                <Tag color="cyan">{ar.admittedMajorGroupCode}</Tag>
              ) : (
                <span className="text-text-muted">--</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="录取专业" span={2}>
              {ar.admittedMajorName ? (
                ar.admittedMajorId ? (
                  <Link
                    href={`/majors/${ar.admittedMajorId}`}
                    className="font-medium text-primary"
                  >
                    {ar.admittedMajorCode ? (
                      <span className="text-text-muted mr-1">[{ar.admittedMajorCode}]</span>
                    ) : null}
                    {ar.admittedMajorName} →
                  </Link>
                ) : (
                  <span className="font-medium">
                    {ar.admittedMajorCode ? (
                      <span className="text-text-muted mr-1">[{ar.admittedMajorCode}]</span>
                    ) : null}
                    {ar.admittedMajorName}
                  </span>
                )
              ) : (
                <span className="text-text-muted">--</span>
              )}
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
            {data.attachments.map((a) => {
              const isImage = a.mimeType?.startsWith('image/');
              const previewUrl = historicalCasesApi.attachmentPreviewUrl(a.id);
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isImage ? (
                      <ImageAttachment previewUrl={previewUrl} alt={a.originalName} />
                    ) : (
                      <span className="text-text-muted text-base">
                        <FileTextOutlined />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="m-0 text-sm">{CATEGORY_LABEL[a.category] ?? a.category}</p>
                      <p className="m-0 truncate text-xs text-text-muted">
                        {a.originalName}
                        {a.fileSize ? ` · ${(a.fileSize / 1024).toFixed(1)} KB` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {/* PDF 预览走 modal iframe; 图片预览交给 antd Image 上面已绑定 */}
                    {!isImage ? (
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setPdfPreview({ url: previewUrl, name: a.originalName })}
                      >
                        预览
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      href={historicalCasesApi.attachmentDownloadUrl(a.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <PdfPreviewModal preview={pdfPreview} onClose={() => setPdfPreview(null)} />
    </div>
  );
}
