'use client';

import { Card } from 'antd';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';

interface Props {
  renameHistory: string | null;
  admissionGuide: string | null;
  charterInfo: any;
}

const has = (v: any) => v != null && v !== '';

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
    const entries = Object.entries(p.charterInfo).filter(([, v]) => v != null && v !== '');
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
