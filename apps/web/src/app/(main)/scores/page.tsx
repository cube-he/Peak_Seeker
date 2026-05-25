'use client';

import { useState } from 'react';
import { Alert, Space } from 'antd';
import MainLayout from '@/components/layout/MainLayout';
import { useUserStore } from '@/stores/userStore';
import { scoreSegmentApi, type ExamType } from '@/services/score-segment';
import { admissionService } from '@/services/admission';
import { bucketAdmissions } from '@/utils/bucket-admissions';
import { ScoreQueryForm, type ScoreQueryValues } from './ScoreQueryForm';
import { PositionCard } from './PositionCard';
import { TieredResults, type TieredBuckets } from './TieredResults';
import { EquivalentScoreTable } from './EquivalentScoreTable';

const LOOKUP_YEAR = 2025;
const PROVINCE = '四川';

interface PositionState {
  rank: number;
  percentile: number;
  subjects: string;
  buckets: TieredBuckets;
  unknownCount: number;
}

export default function ScoresPage() {
  const { examInfo } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionState | null>(null);

  const defaultSubjects = examInfo.subjects[0] ?? '物理';

  const handleQuery = async (values: ScoreQueryValues) => {
    setLoading(true);
    setError(null);
    try {
      const lookup = await scoreSegmentApi.lookup({
        year: LOOKUP_YEAR,
        examType: values.subjects as ExamType,
        score: values.score,
      });
      const aggregated = await admissionService.getAggregated({
        rank: lookup.rank,
        province: PROVINCE,
        subjects: values.subjects,
      });
      const bucketed = bucketAdmissions(aggregated.data, lookup.rank);
      setPosition({
        rank: lookup.rank,
        percentile: lookup.percentile,
        subjects: values.subjects,
        buckets: {
          rush: bucketed.rush,
          stable: bucketed.stable,
          safe: bucketed.safe,
        },
        unknownCount: bucketed.unknownCount,
      });
    } catch {
      setPosition(null);
      setError('换算失败：请检查分数是否在一分一段表范围内');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <ScoreQueryForm
          onSubmit={handleQuery}
          loading={loading}
          defaultSubjects={defaultSubjects}
          defaultScore={examInfo.score}
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
            />
            <TieredResults userRank={position.rank} buckets={position.buckets} />
            <EquivalentScoreTable rank={position.rank} subjects={position.subjects} />
          </>
        ) : null}
      </Space>
    </MainLayout>
  );
}
