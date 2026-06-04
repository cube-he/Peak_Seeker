'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchRecommendationsApi,
  type BatchRecommendation,
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
        // 初始 selected ← 老师上次 confirm 时选的批次, 让老师能看到 + 改
        if (Array.isArray(r.preferredBatches) && r.preferredBatches.length > 0) {
          setSelected(new Set(r.preferredBatches));
        }
      })
      .catch((e) => setError(String(e?.response?.data?.message ?? e?.message ?? e)));
  }, [studentId]);

  // 分 3 段: 已选 / 符合资格 / 不符合
  const sectioned = useMemo(() => {
    if (!data) return { selectedBatches: [], eligible: [], ineligible: [] };
    const isOkVerdict = (v: string) =>
      v === 'ELIGIBLE' || v === 'CONDITIONAL' || v === 'DATA_PENDING';
    const selectedBatches: BatchRecommendation[] = [];
    const eligible: BatchRecommendation[] = [];
    const ineligible: BatchRecommendation[] = [];
    for (const b of data.batches) {
      if (selected.has(b.batchName)) {
        selectedBatches.push(b);
      } else if (isOkVerdict(b.verdict)) {
        eligible.push(b);
      } else {
        ineligible.push(b);
      }
    }
    return { selectedBatches, eligible, ineligible };
  }, [data, selected]);

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
      setSelected(new Set(fresh.preferredBatches ?? []));
    } catch (e: any) {
      setError(String(e?.response?.data?.message ?? e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">批次推荐</h1>
        <a
          href={`/teacher/students/${studentId}`}
          className="text-blue-600 underline text-sm"
        >
          ← 返回学生详情
        </a>
      </div>
      <div className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded">
        ℹ 推荐页仅判定资格。已选批次会在方案生成页限制可用范围。点击批次卡片可展开看详细要求 + 相关文件。
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

      {/* —— Section 1: 已选批次 —— */}
      <section>
        <SectionHeader
          title="已选批次"
          count={sectioned.selectedBatches.length}
          tone="accent"
          hint="勾选/取消会同步到方案生成页可用范围"
        />
        {sectioned.selectedBatches.length === 0 ? (
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-3 rounded">
            还没选, 在下方"符合填报条件"段勾选即可
          </div>
        ) : (
          <div className="space-y-2">
            {sectioned.selectedBatches.map((b) => (
              <BatchCard
                key={b.batchConfigId}
                batch={b}
                selected
                onToggle={() => toggle(b.batchName)}
                disabled={isLocked || submitting}
              />
            ))}
          </div>
        )}
      </section>

      {/* —— Section 2: 符合填报条件 —— */}
      <section>
        <SectionHeader
          title="符合填报条件"
          count={sectioned.eligible.length}
          tone="ok"
          hint="资格通过 / 条件通过 / 详情待补充 — 可勾选进推荐"
        />
        {sectioned.eligible.length === 0 ? (
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-3 rounded">无</div>
        ) : (
          <div className="space-y-2">
            {sectioned.eligible.map((b) => (
              <BatchCard
                key={b.batchConfigId}
                batch={b}
                selected={false}
                onToggle={() => toggle(b.batchName)}
                disabled={isLocked || submitting}
              />
            ))}
          </div>
        )}
      </section>

      {/* —— Section 3: 不符合条件 —— */}
      <section>
        <SectionHeader
          title="不符合条件"
          count={sectioned.ineligible.length}
          tone="fail"
          hint="硬性资格未满足 — 通常不建议勾选"
        />
        {sectioned.ineligible.length === 0 ? (
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-3 rounded">无</div>
        ) : (
          <div className="space-y-2">
            {sectioned.ineligible.map((b) => (
              <BatchCard
                key={b.batchConfigId}
                batch={b}
                selected={false}
                onToggle={() => toggle(b.batchName)}
                disabled={isLocked || submitting}
              />
            ))}
          </div>
        )}
      </section>

      {/* —— 底部提交栏 —— */}
      {!isLocked && (
        <div className="border-t pt-4 sticky bottom-0 bg-white pb-4">
          <div className="mb-2 text-sm">
            已选 <span className="font-semibold">{selected.size}</span> 个批次
          </div>
          <textarea
            className="w-full border rounded p-2 mb-2 text-sm"
            placeholder="老师备注 (可选)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
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

function SectionHeader({
  title,
  count,
  tone,
  hint,
}: {
  title: string;
  count: number;
  tone: 'accent' | 'ok' | 'fail';
  hint: string;
}) {
  const colors: Record<string, string> = {
    accent: 'bg-blue-100 text-blue-700',
    ok: 'bg-green-100 text-green-700',
    fail: 'bg-red-100 text-red-700',
  };
  return (
    <div className="flex items-baseline justify-between gap-2 mb-2 mt-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold m-0">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${colors[tone]}`}>{count}</span>
      </div>
      <span className="text-[11px] text-gray-500">{hint}</span>
    </div>
  );
}
