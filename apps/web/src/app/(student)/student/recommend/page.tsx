'use client';

import { useState } from 'react';
import {
  Card,
  InputNumber,
  Button,
  Empty,
  Spin,
  Tag,
} from 'antd';
import {
  SearchOutlined,
  ThunderboltOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';

interface RecommendResult {
  id: number;
  universityName: string;
  majorName: string;
  gradient: 'rush' | 'stable' | 'safe';
  admissionProbability: number;
  historicalMinScore?: number;
  historicalMinRank?: number;
}

const GRADIENT_STYLE: Record<string, { label: string; color: string; bgClass: string }> = {
  rush: { label: '冲', color: '#c53030', bgClass: 'bg-rush-fixed' },
  stable: { label: '稳', color: '#2c5282', bgClass: 'bg-stable-fixed' },
  safe: { label: '保', color: '#276749', bgClass: 'bg-safe-fixed' },
};

export default function StudentRecommendPage() {
  const [score, setScore] = useState<number | null>(null);
  const [results, setResults] = useState<RecommendResult[] | null>(null);

  const recommendMutation = useMutation({
    mutationFn: (inputScore: number) =>
      studentApi.quickRecommend({ score: inputScore }),
    onSuccess: (data) => {
      setResults(data?.data || []);
    },
  });

  const handleSearch = () => {
    if (score) {
      recommendMutation.mutate(score);
    }
  };

  // Group results by gradient
  const rushItems = results?.filter((r) => r.gradient === 'rush') || [];
  const stableItems = results?.filter((r) => r.gradient === 'stable') || [];
  const safeItems = results?.filter((r) => r.gradient === 'safe') || [];

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-semibold text-text">智能推荐</h1>
      <p className="text-sm text-text-muted">
        输入分数，快速查看匹配院校和专业
      </p>

      {/* Input */}
      <Card size="small">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-sm text-text-secondary block mb-1">
              我的分数
            </label>
            <InputNumber
              value={score}
              onChange={(v) => setScore(v)}
              min={0}
              max={750}
              placeholder="输入高考分数"
              size="large"
              className="w-full"
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={handleSearch}
            loading={recommendMutation.isPending}
            disabled={!score}
          >
            查看推荐
          </Button>
        </div>
      </Card>

      {/* Results */}
      {recommendMutation.isPending ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : results !== null ? (
        results.length === 0 ? (
          <Empty description="暂无匹配结果，请调整分数" />
        ) : (
          <div className="space-y-4">
            {[
              { label: '冲一冲', items: rushItems, key: 'rush' },
              { label: '稳一稳', items: stableItems, key: 'stable' },
              { label: '保一保', items: safeItems, key: 'safe' },
            ].map((group) => {
              const style = GRADIENT_STYLE[group.key];
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag
                      color={style.color}
                      className="text-xs font-medium"
                    >
                      {style.label}
                    </Tag>
                    <span className="text-sm font-medium text-text-secondary">
                      {group.label}
                    </span>
                    <span className="text-xs text-text-faint">
                      ({group.items.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <Card
                        key={item.id}
                        size="small"
                        bodyStyle={{ padding: '12px 14px' }}
                        style={{ borderLeft: `3px solid ${style.color}` }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-text">
                              {item.universityName}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              {item.majorName}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium" style={{ color: style.color }}>
                              {item.admissionProbability}%
                            </div>
                            {item.historicalMinScore && (
                              <div className="text-[10px] text-text-faint">
                                历年最低 {item.historicalMinScore}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* CTA */}
            <Card className="text-center" bodyStyle={{ padding: '20px' }}>
              <p className="text-sm text-text-secondary mb-3">
                想获得完整的个性化方案？联系您的指导老师
              </p>
              <Button icon={<PhoneOutlined />} type="primary" ghost>
                联系老师获取完整方案
              </Button>
            </Card>
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <SearchOutlined className="text-4xl text-text-faint" />
          <p className="text-sm text-text-muted mt-3">输入分数开始推荐</p>
        </div>
      )}
    </div>
  );
}
