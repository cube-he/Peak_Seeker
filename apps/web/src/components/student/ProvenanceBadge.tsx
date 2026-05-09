'use client';

interface Props {
  updatedBy: string | null | undefined;
  updatedAt: Date | string | null | undefined;
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return '今天';
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function ProvenanceBadge({ updatedBy, updatedAt }: Props) {
  if (updatedBy !== 'teacher' || !updatedAt) return null;
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return <span className="ml-2 text-xs text-text-faint">由老师修改 · {formatRelative(date)}</span>;
}
