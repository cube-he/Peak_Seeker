'use client';
import type { ReferenceItem } from '@/services/batch-recommendations-api';

const ICONS: Record<string, string> = {
  pdf: '📄',
  xlsx: '📊',
  doc: '📝',
  announcement: '🌐',
};

export function ReferencesList({ references }: { references: ReferenceItem[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">相关文件:</div>
      <ul className="space-y-1">
        {references.map((ref, i) => (
          <li key={i} className="flex items-center gap-2">
            <span>{ICONS[ref.type] ?? '🌐'}</span>
            <span>{ref.title}</span>
            {ref.available && ref.downloadUrl ? (
              ref.external ? (
                // 外站 (官网公告等): 只显示"查看", 不带 download 参数 (没意义).
                <a
                  className="text-blue-600 underline"
                  href={ref.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看官网
                </a>
              ) : (
                // 本地文件: 预览 + 下载
                <>
                  <a
                    className="text-blue-600 underline"
                    href={ref.downloadUrl}
                    target="_blank"
                    rel="noopener"
                  >
                    预览
                  </a>
                  <a
                    className="text-blue-600 underline"
                    href={`${ref.downloadUrl}?download=1`}
                  >
                    下载
                  </a>
                </>
              )
            ) : (
              <span className="text-gray-400 text-xs italic">
                文件待补
                {ref.sourceNote && <> — {ref.sourceNote}</>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
