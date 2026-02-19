import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendEngine } from './algorithms/recommend-engine';
import { RecommendPlanDto } from './dto/recommend-plan.dto';

@Injectable()
export class RecommendService {
  constructor(
    private prisma: PrismaService,
    private engine: RecommendEngine,
  ) {}

  async generatePlan(dto: RecommendPlanDto) {
    const {
      score,
      rank,
      province,
      preferences,
      strategy = {
        rushCount: 20,
        stableCount: 40,
        safeCount: 36,
        rushRange: 10000,
        safeRange: 5000,
      },
    } = dto;

    // 获取候选院校专业
    const candidates = await this.getCandidates(rank, province, strategy);

    // 计算每个候选的录取概率和策略分类
    const items = candidates.map((c) => {
      const rankDiff = this.engine.calculateRankDiff(rank, c.majorMinRank || 0);
      const acceptRate = this.engine.calculateAcceptRate(rankDiff);
      const strategyType = this.engine.classifyStrategy(rankDiff);
      const riskLevel = this.engine.getRiskLevel(acceptRate);

      return {
        university: c.university,
        major: c.major,
        admission: {
          year: c.year,
          minScore: c.majorMinScore,
          minRank: c.majorMinRank,
        },
        prediction: {
          acceptRate,
          rankDiff,
          riskLevel,
        },
        strategy: strategyType,
        score: this.engine.calculateScore(
          {
            acceptRate,
            university: c.university,
            major: c.major,
          },
          preferences,
        ),
      };
    });

    // 按策略分组并排序
    const rushItems = items
      .filter((i) => i.strategy === 'rush')
      .sort((a, b) => b.score - a.score)
      .slice(0, strategy.rushCount);

    const stableItems = items
      .filter((i) => i.strategy === 'stable')
      .sort((a, b) => b.score - a.score)
      .slice(0, strategy.stableCount);

    const safeItems = items
      .filter((i) => i.strategy === 'safe')
      .sort((a, b) => b.score - a.score)
      .slice(0, strategy.safeCount);

    // 合并并添加顺序
    const planItems = [...rushItems, ...stableItems, ...safeItems].map(
      (item, index) => ({
        order: index + 1,
        ...item,
      }),
    );

    // 计算统计信息
    const statistics = {
      totalCount: planItems.length,
      rushCount: rushItems.length,
      stableCount: stableItems.length,
      safeCount: safeItems.length,
      avgAcceptRate:
        planItems.reduce((sum, i) => sum + i.prediction.acceptRate, 0) /
        planItems.length,
    };

    return {
      plan: {
        id: `plan_${Date.now()}`,
        createdAt: new Date().toISOString(),
        strategy: '冲稳保',
        items: planItems,
      },
      statistics,
    };
  }

  private async getCandidates(
    rank: number,
    province: string,
    strategy: { rushRange: number; safeRange: number },
  ) {
    const year = new Date().getFullYear() - 1;

    return this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinRank: {
          gte: rank - strategy.safeRange - 5000,
          lte: rank + strategy.rushRange + 5000,
        },
      },
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinRank: 'asc' },
      take: 500,
    });
  }

  async recommendUniversities(dto: {
    score: number;
    rank: number;
    province: string;
    limit?: number;
  }) {
    const { rank, province, limit = 20 } = dto;
    const year = new Date().getFullYear() - 1;

    const records = await this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinRank: {
          gte: rank - 5000,
          lte: rank + 5000,
        },
      },
      include: {
        university: true,
      },
      distinct: ['universityId'],
      orderBy: { majorMinRank: 'asc' },
      take: limit,
    });

    return records.map((r) => ({
      ...r.university,
      latestAdmission: {
        year: r.year,
        minScore: r.universityMinScore,
        minRank: r.universityMinRank,
      },
    }));
  }
}
