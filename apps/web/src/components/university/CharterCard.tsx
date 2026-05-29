'use client';

import { Card } from 'antd';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';

interface Props {
  renameHistory: string | null;
  admissionGuide: string | null;
  charterInfo: any;
  // P1 结构化章程
  charterFilingRatio?: string | null;
  charterMajorAssignment?: string | null;
  charterTiebreakRule?: string | null;
  charterForeignLangReq?: string | null;
  charterSubjectReq?: string | null;
  charterPhysicalLimit?: string | null;
  charterBonusPolicy?: string | null;
  charterTuitionDesc?: string | null;
  charterTransferLimit?: string | null;
  charterAcceptAdjust?: string | null;
}

// P1 字段在卡片里的展示顺序与中文标签
const P1_FIELD_ORDER: { key: keyof Props; label: string }[] = [
  { key: 'charterFilingRatio', label: '调档比例' },
  { key: 'charterMajorAssignment', label: '专业分配规则' },
  { key: 'charterTiebreakRule', label: '同分规则' },
  { key: 'charterForeignLangReq', label: '外语要求' },
  { key: 'charterSubjectReq', label: '单科要求' },
  { key: 'charterPhysicalLimit', label: '体检限制' },
  { key: 'charterBonusPolicy', label: '加分政策' },
  { key: 'charterTuitionDesc', label: '学费说明' },
  { key: 'charterTransferLimit', label: '转专业限制' },
  { key: 'charterAcceptAdjust', label: '服从调剂' },
];

const has = (v: any) => v != null && v !== '';

// charterInfo 里这些字段对用户无价值 — 元数据 / 抓取信息 / 冗余,在 UI 上隐藏
const CHARTER_HIDDEN_KEYS = new Set(['来源网址', '章程字数', '采集时间', '是否有章程']);

// 提取首个 http(s) URL；若整串本身是 URL 则返回它
function extractUrl(text: string): string | null {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/.test(trimmed)) return trimmed;
  const m = text.match(/https?:\/\/[^\s'"<>]+/);
  return m ? m[0] : null;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-text-tertiary text-xs font-medium mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export default function CharterCard(p: Props) {
  const sections: React.ReactNode[] = [];

  // P1: 结构化章程要点（来自 05_招生章程 解析）
  const p1Entries = P1_FIELD_ORDER
    .map(({ key, label }) => ({ label, value: p[key] as string | null | undefined }))
    .filter(({ value }) => has(value));
  if (p1Entries.length > 0) {
    sections.push(
      <Section key="p1-structured" label="填报章程要点">
        <div className="space-y-2 text-[13px]">
          {p1Entries.map(({ label, value }) => (
            <div key={label}>
              <div className="text-text-tertiary text-xs mb-0.5">{label}</div>
              <div className="leading-6 whitespace-pre-wrap text-text">{value}</div>
            </div>
          ))}
        </div>
      </Section>,
    );
  }

  if (has(p.renameHistory)) {
    sections.push(
      <Section key="rename" label="更名历史">
        <div className="whitespace-pre-wrap text-[13px] leading-6 text-text">{p.renameHistory}</div>
      </Section>,
    );
  }

  if (has(p.admissionGuide)) {
    const url = extractUrl(p.admissionGuide!);
    sections.push(
      <Section key="guide" label="招生章程">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:text-primary-light text-[13px] break-all"
          >
            <LinkOutlined />
            <span>{url}</span>
          </a>
        ) : (
          <div className="whitespace-pre-wrap text-[13px] leading-6 text-text">
            {p.admissionGuide}
          </div>
        )}
      </Section>,
    );
  }

  // charterInfo: 对象按 key 展平、字符串直显
  let charterRendered: React.ReactNode = null;
  if (p.charterInfo && typeof p.charterInfo === 'object' && !Array.isArray(p.charterInfo)) {
    const entries = Object.entries(p.charterInfo).filter(
      ([k, v]) => v != null && v !== '' && !CHARTER_HIDDEN_KEYS.has(k),
    );
    if (entries.length > 0) {
      charterRendered = (
        <div className="space-y-2 text-[13px]">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="text-text-tertiary text-xs mb-0.5">{k}</div>
              <div className="leading-6 whitespace-pre-wrap text-text">{String(v)}</div>
            </div>
          ))}
        </div>
      );
    }
  } else if (typeof p.charterInfo === 'string' && p.charterInfo) {
    charterRendered = (
      <div className="whitespace-pre-wrap text-[13px] leading-6 text-text">{p.charterInfo}</div>
    );
  }
  if (charterRendered) {
    sections.push(
      <Section key="charter" label="章程详情">
        {charterRendered}
      </Section>,
    );
  }

  if (sections.length === 0) return null;

  return (
    <Card title={<><FileTextOutlined className="mr-1" />招生章程</>} size="small">
      <div className="space-y-4">{sections}</div>
    </Card>
  );
}
