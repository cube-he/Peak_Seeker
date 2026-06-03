'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchRecommendationsApi,
  type BatchRecommendationsResponse,
} from '@/services/batch-recommendations-api';
import { BatchCard } from './BatchCard';

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
      <div className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded">
        ℹ 推荐页仅判定资格 (硬性要求是否满足)。分数推荐请在勾选批次后前往候选池查看院校梯队 (冲/稳/保)。
      </div>
      {data.intakeGap && !data.intakeGap.ok && (
        <div className="border-2 border-red-300 bg-red-50 p-4 rounded">
          <div className="font-semibold text-red-700 mb-2">⚠ 学生关键资料未完成 — 当前判定可能不准</div>
          <div className="text-sm text-red-700 mb-2">
            缺失字段: {(data.intakeGap.missing ?? []).map((m) => m.label).join(' / ')}
          </div>
          <div className="text-xs text-red-600">
            请先催学生补完资料再确认批次。资料未完成时无法确认批次, 也无法进入做方案阶段。
          </div>
          <a
            href={`/teacher/students/${studentId}`}
            className="inline-block mt-2 text-blue-600 underline text-sm"
          >
            → 跳学生详情页催补资料
          </a>
        </div>
      )}
      <a
        href={`/teacher/students/${studentId}`}
        className="text-blue-600 underline text-sm"
      >
        ← 返回学生详情 / 回填资料
      </a>
      <div className="space-y-4">
        {data.batches.map((b) => (
          <BatchCard
            key={b.batchConfigId}
            batch={b}
            selected={selected.has(b.batchName)}
            onToggle={() => toggle(b.batchName)}
            disabled={isLocked || submitting}
          />
        ))}
      </div>
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
            disabled={submitting || selected.size === 0 || (data.intakeGap && !data.intakeGap.ok)}
            onClick={handleSubmit}
            title={data.intakeGap && !data.intakeGap.ok ? '学生关键资料未完成, 请先催学生补完' : undefined}
          >
            {data.intakeGap && !data.intakeGap.ok ? '资料未完成 - 无法确认' : '确认并提交'}
          </button>
        </div>
      )}
    </div>
  );
}
