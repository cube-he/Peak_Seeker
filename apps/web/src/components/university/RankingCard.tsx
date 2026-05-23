'use client';

import { Card, Row, Col, Statistic } from 'antd';

interface RankingCardProps {
  /** 软科主榜名次（本科/民办/高职口径，由 softRankList 区分） */
  softRanking: number | null;
  /** 软科主榜体系：本科 / 民办 / 高职 */
  softRankList: string | null;
  /** 软科榜单年份 */
  softRankYear: number | null;
  /** 软科类别榜名（财经类/医药类等），院校上类别榜时填 */
  softCategory: string | null;
  /** 软科类别榜名次 */
  softCategoryRank: number | null;
  rankingAlumni: number | null;
  rankingQS: number | null;
  rankingUSNews: number | null;
  aClassDisciplineCount: number | null;
}

export default function RankingCard({
  softRanking,
  softRankList,
  softRankYear,
  softCategory,
  softCategoryRank,
  rankingAlumni,
  rankingQS,
  rankingUSNews,
  aClassDisciplineCount,
}: RankingCardProps) {
  const hasAny =
    softRanking != null ||
    softCategoryRank != null ||
    rankingAlumni != null ||
    rankingQS != null ||
    rankingUSNews != null ||
    aClassDisciplineCount != null;

  if (!hasAny) return null;

  // 软科主榜标题携带年份和体系（本科/民办/高职），消除"综合排名"这种口径不明的标签
  const softTitle = ['软科', softRankYear, softRankList ? softRankList + '榜' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <Card title="院校排名" size="small" className="mt-4">
      <Row gutter={[24, 16]}>
        {softRanking != null && (
          <Col xs={12} sm={6}>
            <Statistic title={softTitle} value={softRanking} prefix="#" />
          </Col>
        )}
        {softCategory && softCategoryRank != null && (
          <Col xs={12} sm={6}>
            <Statistic title={softCategory} value={softCategoryRank} prefix="#" />
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
