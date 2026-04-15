'use client';

import { Card, Row, Col, Statistic } from 'antd';

interface RankingCardProps {
  rankingSoft: number | null;
  rankingAlumni: number | null;
  rankingQS: number | null;
  rankingUSNews: number | null;
  aClassDisciplineCount: number | null;
}

export default function RankingCard({
  rankingSoft,
  rankingAlumni,
  rankingQS,
  rankingUSNews,
  aClassDisciplineCount,
}: RankingCardProps) {
  const hasAny =
    rankingSoft != null ||
    rankingAlumni != null ||
    rankingQS != null ||
    rankingUSNews != null ||
    aClassDisciplineCount != null;

  if (!hasAny) return null;

  return (
    <Card title="院校排名" size="small" className="mt-4">
      <Row gutter={[24, 16]}>
        {rankingSoft != null && (
          <Col xs={12} sm={6}>
            <Statistic title="软科排名" value={rankingSoft} prefix="#" />
          </Col>
        )}
        {rankingAlumni != null && (
          <Col xs={12} sm={6}>
            <Statistic title="校友会排名" value={rankingAlumni} prefix="#" />
          </Col>
        )}
        {rankingQS != null && (
          <Col xs={12} sm={6}>
            <Statistic title="QS排名" value={rankingQS} prefix="#" />
          </Col>
        )}
        {rankingUSNews != null && (
          <Col xs={12} sm={6}>
            <Statistic title="US News排名" value={rankingUSNews} prefix="#" />
          </Col>
        )}
        {aClassDisciplineCount != null && (
          <Col xs={12} sm={6}>
            <Statistic title="A类学科数" value={aClassDisciplineCount} suffix="个" />
          </Col>
        )}
      </Row>
    </Card>
  );
}
