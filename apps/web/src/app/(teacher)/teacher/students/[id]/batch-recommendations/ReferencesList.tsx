'use client';
import type { ReferenceItem } from '@/services/batch-recommendations-api';

export function ReferencesList({ references }: { references: ReferenceItem[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">相关文件:</div>
      <ul className="space-y-1">
        {references.map((ref, i) => (
          <li key={i} className="flex items-center gap-2">
            <span>{ref.type === 'pdf' ? '📄' : ref.type === 'xlsx' ? '📊' : '🌐'}</span>
            <span>{ref.title}</span>
            {ref.available && ref.downloadUrl ? (
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
