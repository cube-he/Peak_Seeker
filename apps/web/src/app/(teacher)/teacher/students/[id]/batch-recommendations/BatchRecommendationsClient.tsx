'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchRecommendationsApi,
  type BatchRecommendationsResponse,
  type BatchRecommendation,
  type SubsetResult,
} from '@/services/batch-recommendations-api';

export function BatchRecommendationsClient({ studentId }: { studentId: number }) {
  const router = useRouter();
  const [data, setData] = useState<BatchRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    batchRecommendationsApi
      .fetch(studentId)
      .then((r) => {
        setData(r);
      })
      .catch((e) => setError(String(e?.response?.data?.message ?? e?.message ?? e)));
  }, [studentId]);

  if (error) return <div className="p-6 text-red-600">加载失败: {error}</div>;
  if (!data) return <div className="p-6">加载中…</div>;

  const isLocked = !!data.batchesConfirmedAt;

  function toggle(batchName: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(batchName)) next.delete(batchName);
      else next.add(batchName);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      setError('至少勾选 1 个批次');
      return;
    }
    setSubmitting(true);
    try {
      await batchRecommendationsApi.confirm(studentId, Array.from(selected), comment || undefined);
      router.push(`/teacher/students/${studentId}`);
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? e?.message ?? e));
      setSubmitting(false);
    }
  }

  async function handleUnlock() {
    if (!confirm('确认解锁? 学生会回到资料修改状态')) return;
    setSubmitting(true);
    try {
      await batchRecommendationsApi.unlock(studentId);
      const fresh = await batchRecommendationsApi.fetch(studentId);
      setData(fresh);
      setSelected(new Set());
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {isLocked && (
        <div className="border p-4 bg-yellow-50">
          <div>已锁定: {new Date(data.batchesConfirmedAt!).toLocaleString()}</div>
          <button
            className="mt-2 px-3 py-1 border rounded"
            disabled={submitting}
            onClick={handleUnlock}
          >
            重新打开
          </button>
        </div>
      )}
      <h1 className="text-xl font-bold">批次推荐</h1>
      <a
        href={`/teacher/students/${studentId}`}
        className="text-blue-600 underline text-sm"
      >
        ← 返回学生详情 / 回填资料
      </a>
      <BatchCardList
        batches={data.batches}
        selected={selected}
        onToggle={toggle}
        disabled={isLocked || submitting}
      />
      {!isLocked && (
        <div className="border-t pt-4 sticky bottom-0 bg-white">
          <div className="mb-2">已选 {selected.size} 个批次</div>
          <textarea
            className="w-full border rounded p-2 mb-2"
            placeholder="老师备注 (可选)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={submitting || selected.size === 0}
            onClick={handleSubmit}
          >
            确认并提交
          </button>
        </div>
      )}
    </div>
  );
}

// 占位组件, Task 11 实装为完整 BatchCard
function BatchCardList({
  batches,
  selected,
  onToggle,
  disabled,
}: {
  batches: BatchRecommendation[];
  selected: Set<string>;
  onToggle: (b: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      {batches.map((b) => (
        <div key={b.batchConfigId} className="border p-4 rounded">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.has(b.batchName)}
              onChange={() => onToggle(b.batchName)}
              disabled={disabled}
            />
            <span className="font-semibold">{b.batchName}</span>
            <span className="text-sm text-gray-600">[{b.verdict}]</span>
          </label>
          <div className="mt-2 text-sm">
            {(b.subsetResults ?? []).map((s: SubsetResult) => (
              <div key={s.code} className="ml-4 text-gray-700">
                ▸ {s.name} — {s.verdict}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
