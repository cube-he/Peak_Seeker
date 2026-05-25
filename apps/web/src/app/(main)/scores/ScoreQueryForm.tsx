'use client';

import { useState } from 'react';
import { Button, Card, Form, InputNumber, Select, Typography } from 'antd';

const { Text } = Typography;

export interface ScoreQueryValues {
  subjects: string;
  score: number;
}

interface ScoreQueryFormProps {
  onSubmit: (values: ScoreQueryValues) => void;
  loading: boolean;
  defaultSubjects?: string;
  defaultScore?: number | null;
}

const SUBJECT_OPTIONS = [
  { label: '物理', value: '物理' },
  { label: '历史', value: '历史' },
];

export function ScoreQueryForm({
  onSubmit,
  loading,
  defaultSubjects = '物理',
  defaultScore,
}: ScoreQueryFormProps) {
  const [subjects, setSubjects] = useState<string>(defaultSubjects);
  const [score, setScore] = useState<number | null>(defaultScore ?? null);

  const handleSubmit = () => {
    if (score === null) {
      return;
    }
    onSubmit({ subjects, score });
  };

  return (
    <Card title="按分数查">
      <Form layout="vertical">
        <Form.Item label="省份">
          <Text strong>四川</Text>
        </Form.Item>
        <Form.Item label="选科" required>
          <Select
            value={subjects}
            options={SUBJECT_OPTIONS}
            onChange={setSubjects}
            style={{ width: 160 }}
          />
        </Form.Item>
        <Form.Item label="总分" required>
          <InputNumber
            value={score}
            onChange={(value) => setScore(value)}
            min={0}
            max={750}
            size="large"
            style={{ width: 200 }}
            placeholder="输入总分"
          />
        </Form.Item>
        <Form.Item>
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={score === null}
          >
            查询
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
