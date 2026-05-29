'use client';

import { useState } from 'react';
import { Button, Card, Form, InputNumber, Radio, Select, Typography } from 'antd';

const { Text } = Typography;

export interface ScoreQueryValues {
  mode: 'score' | 'rank';
  year: number;
  subjects: string;
  score?: number;
  rank?: number;
}

interface ScoreQueryFormProps {
  onSubmit: (values: ScoreQueryValues) => void;
  loading: boolean;
  defaultSubjects?: string;
  defaultScore?: number | null;
  defaultRank?: number | null;
  defaultYear?: number;
  defaultMode?: 'score' | 'rank';
}

// 2025 起四川新高考: 物理/历史; 2024 及以前: 理科/文科
const NEW_GAOKAO_SUBJECTS = [
  { label: '物理', value: '物理' },
  { label: '历史', value: '历史' },
];
const OLD_GAOKAO_SUBJECTS = [
  { label: '理科', value: '理科' },
  { label: '文科', value: '文科' },
];
const YEAR_OPTIONS = [2025, 2024, 2023, 2022].map((y) => ({ label: String(y), value: y }));

function isNewGaokaoYear(year: number): boolean {
  return year >= 2025;
}

/** 年份切换时, 把已选科类映射到该年代的术语 (物理↔理科, 历史↔文科). */
function mapSubjectToYear(subjects: string, newYear: number): string {
  const newIsNew = isNewGaokaoYear(newYear);
  if (newIsNew && subjects === '理科') return '物理';
  if (newIsNew && subjects === '文科') return '历史';
  if (!newIsNew && subjects === '物理') return '理科';
  if (!newIsNew && subjects === '历史') return '文科';
  return subjects;
}

export function ScoreQueryForm({
  onSubmit,
  loading,
  defaultSubjects = '物理',
  defaultScore,
  defaultRank,
  defaultYear = 2025,
  defaultMode = 'score',
}: ScoreQueryFormProps) {
  const [mode, setMode] = useState<'score' | 'rank'>(defaultMode);
  const [year, setYear] = useState<number>(defaultYear);
  const [subjects, setSubjects] = useState<string>(
    mapSubjectToYear(defaultSubjects, defaultYear),
  );
  const [score, setScore] = useState<number | null>(defaultScore ?? null);
  const [rank, setRank] = useState<number | null>(defaultRank ?? null);

  const subjectOptions = isNewGaokaoYear(year) ? NEW_GAOKAO_SUBJECTS : OLD_GAOKAO_SUBJECTS;

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    setSubjects((cur) => mapSubjectToYear(cur, newYear));
  };

  const handleSubmit = () => {
    if (mode === 'score' && score === null) return;
    if (mode === 'rank' && rank === null) return;
    onSubmit({
      mode,
      year,
      subjects,
      score: mode === 'score' ? score! : undefined,
      rank: mode === 'rank' ? rank! : undefined,
    });
  };

  const submitDisabled = mode === 'score' ? score === null : rank === null;

  return (
    <Card title="按分数/位次查">
      <Form layout="vertical">
        <Form.Item label="查询方式">
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio.Button value="score">按分数</Radio.Button>
            <Radio.Button value="rank">按位次</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="年份" required>
          <Select
            value={year}
            options={YEAR_OPTIONS}
            onChange={handleYearChange}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="省份">
          <Text strong>四川</Text>
        </Form.Item>
        <Form.Item label="选科" required>
          <Select
            value={subjects}
            options={subjectOptions}
            onChange={setSubjects}
            style={{ width: 160 }}
          />
        </Form.Item>
        {mode === 'score' ? (
          <Form.Item label="总分" required>
            <InputNumber
              value={score}
              onChange={(value) => setScore(value)}
              min={300}
              max={750}
              size="large"
              style={{ width: 200 }}
              placeholder="输入总分 (300-750)"
            />
          </Form.Item>
        ) : (
          <Form.Item label="位次" required>
            <InputNumber
              value={rank}
              onChange={(value) => setRank(value)}
              min={1}
              size="large"
              style={{ width: 200 }}
              placeholder="输入位次"
            />
          </Form.Item>
        )}
        <Form.Item>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={submitDisabled}
          >
            查询
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
