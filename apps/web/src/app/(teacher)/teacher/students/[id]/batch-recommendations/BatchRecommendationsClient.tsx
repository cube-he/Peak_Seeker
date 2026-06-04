'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  batchRecommendationsApi,
  type BatchRecommendation,
  type BatchRecommendationsResponse,
  type StudentSummary,
} from '@/services/batch-recommendations-api';
import { BatchCard } from './BatchCard';

const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_LIBERAL: '文科综合',
  COMPREHENSIVE_SCIENCE: '理科综合',
};

export function BatchRecommendationsClient({ studentId }: { studentId: number }) {
  const router = useRouter();
  const [data, setData] = useState<BatchRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    batchRecommendationsApi
      .fetch(studentId)
      .then((r) => {
        setData(r);
        if (Array.isArray(r.preferredBatches) && r.preferredBatches.length > 0) {
          setSelected(new Set(r.preferredBatches));
        }
      })
      .catch((e) => setError(String(e?.response?.data?.message ?? e?.message ?? e)));
  }, [studentId]);

  // 分 3 段 + 搜索过滤
  const sectioned = useMemo(() => {
    if (!data) return { selectedBatches: [], eligible: [], ineligible: [] };
    const isOkVerdict = (v: string) =>
      v === 'ELIGIBLE' || v === 'CONDITIONAL' || v === 'DATA_PENDING';
    const matchesSearch = (b: BatchRecommendation) =>
      !searchTerm || b.batchName.includes(searchTerm);
    const selectedBatches: BatchRecommendation[] = [];
    const eligible: BatchRecommendation[] = [];
    const ineligible: BatchRecommendation[] = [];
    for (const b of data.batches) {
      if (!matchesSearch(b)) continue;
      if (selected.has(b.batchName)) {
        selectedBatches.push(b);
      } else if (isOkVerdict(b.verdict)) {
        eligible.push(b);
      } else {
        ineligible.push(b);
      }
    }
    return { selectedBatches, eligible, ineligible };
  }, [data, selected, searchTerm]);

  if (error) return <div className="p-6 text-red-600">加载失败: {error}</div>;
  if (!data) return <div className="p-6">加载中…</div>;

  const isLocked = !!data.batchesConfirmedAt;
  const eligibleNames = data.batches
    .filter((b) => b.verdict === 'ELIGIBLE' || b.verdict === 'CONDITIONAL')
    .map((b) => b.batchName);

  function toggle(batchName: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(batchName)) next.delete(batchName);
      else next.add(batchName);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligibleNames));
  }

  function clearAll() {
    setSelected(new Set());
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
      {/* —— P0-1: 顶部学生 summary —— */}
      <StudentSummaryPanel student={data.student} />

      {isLocked && (
        <div className="border p-4 bg-yellow-50">
          <div>
            已锁定: {new Date(data.batchesConfirmedAt!).toLocaleString('zh-CN')}
            {data.student.intakeReviewComment ? (
              <span className="text-sm text-gray-600 ml-2">
                · 上次备注: {data.student.intakeReviewComment}
              </span>
            ) : null}
          </div>
          <button
            className="mt-2 px-3 py-1 border rounded"
            disabled={submitting}
            onClick={handleUnlock}
          >
            重新打开
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold m-0">批次推荐</h1>
        <a
          href={`/teacher/students/${studentId}`}
          className="text-blue-600 underline text-sm"
        >
          ← 返回学生详情
        </a>
      </div>

      <div className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded">
        ℹ 勾选某批次 = 让方案生成可用该批次下<b>所有"资格通过"</b>的子类别 (例如本科批A段会包含普通类等)。
        点批次卡片可展开看子类别 + 相关文件。
      </div>

      {data.intakeGap && !data.intakeGap.ok && (
        <div className="border-2 border-red-300 bg-red-50 p-4 rounded">
          <div className="font-semibold text-red-700 mb-2">⚠ 学生关键资料未完成 — 当前判定可能不准</div>
          <div className="text-sm text-red-700 mb-2">
            缺失字段: {(data.intakeGap.missing ?? []).map((m) => m.label).join(' / ')}
          </div>
          <a
            href={`/teacher/students/${studentId}`}
            className="inline-block text-blue-600 underline text-sm"
          >
            → 跳学生详情页催补资料
          </a>
        </div>
      )}

      {/* —— P1-6 + P2-9: 搜索 + 快捷按钮 —— */}
      <div className="flex flex-wrap items-center gap-2 border-y py-2">
        <input
          type="search"
          placeholder="搜批次名 (例如: 高职 / 本科批A)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border rounded px-2 py-1 text-sm flex-1 min-w-[200px]"
        />
        <button
          type="button"
          className="px-2 py-1 text-xs border rounded text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          onClick={selectAllEligible}
          disabled={isLocked || submitting}
          title="把所有 ELIGIBLE / CONDITIONAL 的批次都勾上"
        >
          全选符合资格 ({eligibleNames.length})
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs border rounded text-red-700 hover:bg-red-50 disabled:opacity-50"
          onClick={clearAll}
          disabled={isLocked || submitting || selected.size === 0}
        >
          清空已选
        </button>
      </div>

      {/* —— Section 1: 已选批次 —— */}
      <section>
        <SectionHeader title="已选批次" count={sectioned.selectedBatches.length} tone="accent"
          hint="勾选/取消会同步到方案生成页可用范围" />
        {sectioned.selectedBatches.length === 0 ? (
          <div className="text-xs text-gray-500 bg-gray-50 px-3 py-3 rounded">
            还没选, 在下方"符合填报条件"段勾选
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
        <SectionHeader title="符合填报条件" count={sectioned.eligible.length} tone="ok"
          hint="可勾选进推荐" />
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
        <SectionHeader title="不符合条件" count={sectioned.ineligible.length} tone="fail"
          hint="硬性资格未满足 — 通常不建议勾选" />
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
        <div className="border-t pt-4 sticky bottom-0 bg-white pb-4 space-y-2">
          {/* P0-2: 已选 chip 列表 */}
          <div className="text-sm">
            <span>已选 <b>{selected.size}</b> 个批次:</span>{' '}
            {selected.size === 0 ? (
              <span className="text-gray-400 italic">(未选)</span>
            ) : (
              Array.from(selected).map((name) => (
                <span
                  key={name}
                  className="inline-block mr-1 mb-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                >
                  {name}
                  <button
                    type="button"
                    className="ml-1 text-blue-600 hover:text-red-600"
                    onClick={() => toggle(name)}
                    aria-label={`取消 ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          {data.batchesConfirmedAt ? (
            <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
              ⚠ 上次已确认 {new Date(data.batchesConfirmedAt).toLocaleDateString('zh-CN')},
              提交会<b>覆盖</b>上次选择 + 影响方案生成页可用批次
            </div>
          ) : null}
          <textarea
            className="w-full border rounded p-2 text-sm"
            placeholder="老师备注 (可选, 例如: 学生想冲强基, 我担心保不住二本)"
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

/** P0-1: 顶部 student summary — 老师管多个学生时秒判 */
function StudentSummaryPanel({ student }: { student: StudentSummary }) {
  const examTypeLabel = student.examType ? EXAM_TYPE_LABEL[student.examType] ?? student.examType : '--';
  const subjectStr = student.firstChoice && Array.isArray(student.reChoices) && student.reChoices.length > 0
    ? `${examTypeLabel} · ${student.firstChoice} · ${student.reChoices.join('/')}`
    : examTypeLabel;
  return (
    <div className="border rounded bg-slate-50 p-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span className="font-bold text-base">
        {student.realName ?? `学生 ${student.id}`}
      </span>
      <span className="text-gray-600">
        选科: <b className="text-gray-900">{subjectStr}</b>
      </span>
      <span className="text-gray-600">
        总分: <b className="text-gray-900">{student.totalScore ?? '--'}</b>
      </span>
      <span className="text-gray-600">
        位次: <b className="text-gray-900">{student.provincialRank != null ? student.provincialRank.toLocaleString('zh-CN') : '--'}</b>
      </span>
      <span className="text-gray-600">
        高考年份: <b className="text-gray-900">{student.examYear ?? '--'}</b>
      </span>
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
    <div className="flex items-baseline justify-between gap-2 mb-2 mt-3 flex-wrap">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold m-0">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${colors[tone]}`}>{count}</span>
      </div>
      <span className="text-[11px] text-gray-500">{hint}</span>
    </div>
  );
}
