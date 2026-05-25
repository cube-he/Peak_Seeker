'use client';

import { Card, Col, Row, Statistic, Typography } from 'antd';

const { Text } = Typography;

interface PositionCardProps {
  rank: number;
  percentile: number;
  rushCount: number;
  stableCount: number;
  safeCount: number;
  unknownCount: number;
}

export function PositionCard({
  rank,
  percentile,
  rushCount,
  stableCount,
  safeCount,
  unknownCount,
}: PositionCardProps) {
  return (
    <Card title="你的定位">
      <Row gutter={16}>
        <Col span={8}>
          <Statistic title="换算位次" value={rank} groupSeparator="" />
        </Col>
        <Col span={8}>
          <Statistic title="省排名" value={`前 ${percentile}%`} />
        </Col>
        <Col span={8}>
          <Statistic title="可冲" value={rushCount} />
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Statistic title="较稳" value={stableCount} />
        </Col>
        <Col span={8}>
          <Statistic title="保底" value={safeCount} />
        </Col>
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
        基于 2025 一分一段表换算
        {unknownCount > 0 ? `，另有 ${unknownCount} 所数据不足` : ''}
      </Text>
    </Card>
  );
}
