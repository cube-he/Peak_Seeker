'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Space } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { useUserStore } from '@/stores/userStore';
import {
  scoreSegmentApi,
  type ExamType,
  type LookupResult,
} from '@/services/score-segment';
import { admissionService } from '@/services/admission';
import { bucketAdmissions } from '@/utils/bucket-admissions';
import { ScoreQueryForm, type ScoreQueryValues } from './ScoreQueryForm';
import { PositionCard } from './PositionCard';
import { TieredResults, type TieredBuckets } from './TieredResults';
import { EquivalentScoreTable } from './EquivalentScoreTable';

const PROVINCE = '四川';

interface PositionState {
  rank: number;
  score: number;
  percentile: number;
  subjects: string;
  year: number;
  buckets: TieredBuckets;
  unknownCount: number;
}

function parseIntParam(v: string | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveErrorMessage(e: unknown): string {
  // 这里 e 形如 axios 异常 {response:{status, data:{message}}, message}
  const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
  const status = err?.response?.status;
  const apiMsg = err?.response?.data?.message;
  if (!status) return '网络错误，请检查连接后重试';
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 400 || status === 422) return apiMsg ?? '参数有误，请检查分数/位次范围';
  if (status === 404) return '未找到对应数据，请确认分数/位次是否在一分一段表范围内';
  return apiMsg ?? '查询失败，请稍后重试';
}

function ScoresPageContent() {
  const { examInfo } = useUserStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionState | null>(null);
  // EquivalentScoreTable 改为纯展示, rows 由 page 一次性 fetch.
  const [equivalentRows, setEquivalentRows] = useState<LookupResult[]>([]);

  // URL 初始值 (一次性, 后续 URL 同步由 handleQuery 推动).
  const initial = useMemo(() => {
    const mode = (searchParams.get('mode') === 'rank' ? 'rank' : 'score') as 'score' | 'rank';
    const year = parseIntParam(searchParams.get('year')) ?? 2025;
    const subjects = searchParams.get('subjects') ?? examInfo.subjects[0] ?? '物理';
    const score = parseIntParam(searchParams.get('score'));
    const rank = parseIntParam(searchParams.get('rank'));
    return { mode, year, subjects, score, rank };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQuery = useCallback(
    async (values: ScoreQueryValues) => {
      setLoading(true);
      setError(null);
      try {
        // 第一步: lookup 拿 rank/percentile. score↔rank 二选一.
        const lookup = await scoreSegmentApi.lookup({
          year: values.year,
          examType: values.subjects as ExamType,
          score: values.mode === 'score' ? values.score : undefined,
          rank: values.mode === 'rank' ? values.rank : undefined,
        });
        // 第二步: 并行 getAggregated + equivalent (省一次串行往返).
        const [aggregated, equiv] = await Promise.all([
          admissionService.getAggregated({
            rank: lookup.rank,
            province: PROVINCE,
            subjects: values.subjects,
          }),
          scoreSegmentApi.equivalent({
            baseYear: values.year,
            examType: values.subjects as ExamType,
            rank: lookup.rank,
          }),
        ]);
        const bucketed = bucketAdmissions(aggregated.data, lookup.rank);
        setPosition({
          rank: lookup.rank,
          score: lookup.score,
          percentile: lookup.percentile,
          subjects: values.subjects,
          year: values.year,
          buckets: {
            rush: bucketed.rush,
            stable: bucketed.stable,
            safe: bucketed.safe,
          },
          unknownCount: bucketed.unknownCount,
        });
        const allYears = [equiv.base, ...equiv.equivalents];
        allYears.sort((a, b) => a.year - b.year);
        setEquivalentRows(allYears);
        // 同步 URL — replace 不堆历史.
        const params = new URLSearchParams();
        params.set('mode', values.mode);
        params.set('year', String(values.year));
        params.set('subjects', values.subjects);
        if (values.mode === 'score' && values.score != null) {
          params.set('score', String(values.score));
        } else if (values.mode === 'rank' && values.rank != null) {
          params.set('rank', String(values.rank));
        }
        router.replace(`${pathname}?${params.toString()}`);
      } catch (e) {
        setPosition(null);
        setEquivalentRows([]);
        setError(resolveErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [pathname, router],
  );

  // 一次性: URL 有完整参数 → 自动查询; 否则学生 examInfo.score 有值 → fallback.
  const didAutoQueryRef = useRef(false);
  useEffect(() => {
    if (didAutoQueryRef.current) return;
    if (initial.mode === 'score' && initial.score != null) {
      didAutoQueryRef.current = true;
      void handleQuery({
        mode: 'score',
        year: initial.year,
        subjects: initial.subjects,
        score: initial.score,
      });
      return;
    }
    if (initial.mode === 'rank' && initial.rank != null) {
      didAutoQueryRef.current = true;
      void handleQuery({
        mode: 'rank',
        year: initial.year,
        subjects: initial.subjects,
        rank: initial.rank,
      });
      return;
    }
    // 学生 profile fallback: 仅当大类是 物理/历史/理科/文科 时触发.
    if (
      examInfo.score != null &&
      ['物理', '历史', '理科', '文科'].includes(initial.subjects)
    ) {
      didAutoQueryRef.current = true;
      void handleQuery({
        mode: 'score',
        year: initial.year,
        subjects: initial.subjects,
        score: examInfo.score,
      });
    }
  }, [initial, examInfo.score, handleQuery]);

  return (
    <MainLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ScoreQueryForm
          onSubmit={handleQuery}
          loading={loading}
          defaultMode={initial.mode}
          defaultYear={initial.year}
          defaultSubjects={initial.subjects}
          defaultScore={initial.score ?? examInfo.score}
          defaultRank={initial.rank}
        />

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {position ? (
          <>
            <PositionCard
              rank={position.rank}
              percentile={position.percentile}
              rushCount={position.buckets.rush.length}
              stableCount={position.buckets.stable.length}
              safeCount={position.buckets.safe.length}
              unknownCount={position.unknownCount}
              year={position.year}
            />
            <TieredResults userRank={position.rank} buckets={position.buckets} />
            <EquivalentScoreTable rows={equivalentRows} baseYear={position.year} />
          </>
        ) : null}
      </Space>
    </MainLayout>
  );
}

export default function ScoresPage() {
  // useSearchParams 在 next.js 14 app router SSR 下要求 Suspense 包裹.
  return (
    <Suspense fallback={null}>
      <ScoresPageContent />
    </Suspense>
  );
}
