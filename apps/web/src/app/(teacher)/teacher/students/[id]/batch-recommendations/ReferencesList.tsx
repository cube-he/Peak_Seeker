'use client';
import type { ReferenceItem } from '@/services/batch-recommendations-api';
import { TIcon } from './icons';
import { REF_ICON_TEXT, REF_ICON_TONE, previewUrlFor } from './maps';

/**
 * §7.9 相关文件列表 - 文件三态:
 *   external=true  → 「查看官网」 单链接
 *   available=true → 「预览」+「下载」 双链接 (doc/xlsx 预览走同名 .preview.pdf)
 *   available=false → 灰字 "文件待补"
 */
export function ReferencesList({ references }: { references: ReferenceItem[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div className="br-refs">
      <div className="br-refs-title">相关政策文件</div>
      {references.map((rf, i) => <Ref key={i} rf={rf} />)}
    </div>
  );
}

function Ref({ rf }: { rf: ReferenceItem }) {
  const icText = REF_ICON_TEXT[rf.type] ?? 'DOC';
  const icTone = REF_ICON_TONE[rf.type] ?? 'doc';
  const open = (url: string | null) => { if (url) window.open(url, '_blank', 'noopener'); };

  return (
    <div className="br-ref">
      <span className={`br-ref-ic t-${icTone}`}>{icText}</span>
      {rf.available && rf.downloadUrl ? (
        <>
          <span className="br-ref-title">{rf.title}</span>
          <span className="br-ref-actions">
            {rf.external ? (
              <span className="br-ref-link" onClick={() => open(rf.downloadUrl)}>
                <TIcon.link/> 查看官网
              </span>
            ) : (
              <>
                <span className="br-ref-link" onClick={() => open(previewUrlFor(rf))}>预览</span>
                <span className="br-ref-link" onClick={() => open(rf.downloadUrl ? `${rf.downloadUrl}?download=1` : null)}>
                  <TIcon.download/> 下载
                </span>
              </>
            )}
          </span>
        </>
      ) : (
        <span className="br-ref-title pending">
          {rf.title} · 文件待补
          {rf.sourceNote && <span className="br-ref-pending-note"> — {rf.sourceNote}</span>}
        </span>
      )}
    </div>
  );
}
