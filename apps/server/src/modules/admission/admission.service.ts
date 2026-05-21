import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { FindAggregatedDto } from './dto/find-aggregated.dto';
import type {
  AggregatedAdmissionResponse,
  AggregatedAdmissionListItem,
} from '@volunteer-helper/shared';
import * as fs from 'fs';
import * as path from 'path';

let _cachedTargetYear: number | null = null;

/**
 * Returns the configured target year for rank predictions.
 * Reads `config/rank-prediction.json` once and caches.
 * Falls back to current calendar year if config missing.
 */
function getTargetYear(): number {
  if (_cachedTargetYear !== null) return _cachedTargetYear;
  // Resolve from project root (process.cwd() when server starts there)
  // Two candidates cover all documented launch modes:
  //   - Project root cwd (rare): candidate 1
  //   - apps/server/ cwd (common: nest start, node dist/main): candidate 2
  const candidates = [
    path.resolve(process.cwd(), 'config/rank-prediction.json'),
    path.resolve(process.cwd(), '../../config/rank-prediction.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Number.isInteger(cfg.targetYear)) {
        _cachedTargetYear = cfg.targetYear as number;
        return _cachedTargetYear as number;
      }
    }
  }
  _cachedTargetYear = new Date().getFullYear();
  return _cachedTargetYear;
}

@Injectable()
export class AdmissionService {
  constructor(private prisma: PrismaService) {}

  async findByScore(query: {
    score: number;
    province: string;
    year?: number;
    range?: number;
  }) {
    const { score, province, year = new Date().getFullYear() - 1, range = 20 } = query;

    return this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinScore: {
          gte: score - range,
          lte: score + range,
        },
      },
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinScore: 'desc' },
      take: 100,
    });
  }

  async findByRank(query: {
    rank: number;
    province: string;
    year?: number;
    range?: number;
  }) {
    const { rank, province, year = new Date().getFullYear() - 1, range = 5000 } = query;

    return this.prisma.admissionRecord.findMany({
      where: {
        province,
        year,
        majorMinRank: {
          gte: rank - range,
          lte: rank + range,
        },
      },
      include: {
        university: true,
        major: true,
      },
      orderBy: { majorMinRank: 'asc' },
      take: 100,
    });
  }

  async getStatistics(province: string, year?: number) {
    const targetYear = year || new Date().getFullYear() - 1;

    const stats = await this.prisma.admissionRecord.aggregate({
      where: {
        province,
        year: targetYear,
      },
      _avg: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _min: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _max: {
        majorMinScore: true,
        majorMinRank: true,
      },
      _count: true,
    });

    return {
      year: targetYear,
      province,
      ...stats,
    };
  }

  async findAggregated(dto: FindAggregatedDto): Promise<AggregatedAdmissionResponse> {
    const {
      score,
      rank,
      province,
      range,
      batch,
      subjects,
      recruitType,
      is985,
      is211,
      isDoubleFirstClass,
    } = dto;

    if (score == null && rank == null) {
      throw new BadRequestException('score or rank is required');
    }

    const scoreRange = range ?? 20;
    const rankRange = range ?? 30000;

    // 构建 where 条件
    const where: any = { province };
    if (batch) where.batch = batch;
    if (subjects) where.subjects = subjects;
    if (recruitType) where.recruitType = recruitType;

    // 分数/位次范围过滤（OR: majorMin 或 groupMin 命中即可）
    if (score) {
      where.OR = [
        { majorMinScore: { gte: score - scoreRange, lte: score + scoreRange } },
        { groupMinScore: { gte: score - scoreRange, lte: score + scoreRange } },
      ];
    } else if (rank) {
      where.OR = [
        { majorMinRank: { gte: rank - rankRange, lte: rank + rankRange } },
        { groupMinRank: { gte: rank - rankRange, lte: rank + rankRange } },
      ];
    }

    // 院校特征过滤
    if (is985 || is211 || isDoubleFirstClass) {
      where.university = {};
      if (is985) where.university.is985 = true;
      if (is211) where.university.is211 = true;
      if (isDoubleFirstClass) where.university.isDoubleFirstClass = true;
    }

    const records = await this.prisma.admissionRecord.findMany({
      where,
      select: {
        universityId: true,
        majorId: true,
        year: true,
        majorCode: true,
        majorName: true,
        groupCode: true,
        batch: true,
        subjects: true,
        recruitType: true,
        majorMinScore: true,
        majorMinRank: true,
        majorAvgScore: true,
        majorAvgRank: true,
        majorAdmissionCount: true,
        groupMinScore: true,
        groupMinRank: true,
        groupAdmissionCount: true,
        university: {
          select: {
            id: true,
            name: true,
            code: true,
            province: true,
            city: true,
            type: true,
            runningNature: true,
            is985: true,
            is211: true,
            isDoubleFirstClass: true,
            logoUrl: true,
          },
        },
        major: {
          select: {
            id: true,
            name: true,
            category: true,
            discipline: true,
            softRating: true,
          },
        },
      },
      orderBy: [{ universityId: 'asc' }, { majorCode: 'asc' }, { year: 'desc' }],
      take: 10000,
    });

    // 按 (universityId, majorCode, groupCode, batch, recruitType, subjects) 分组。
    // subjects 加入分组键，避免物理/历史记录被并成一行。
    const groups = new Map<string, {
      university: any;
      major: any;
      majorCode: string;
      majorName: string;
      groupCode: string;
      batch: string;
      subjects: string;
      recruitType: string;
      yearlyData: { majorMinScore: number | null; majorMinRank: number | null; groupMinScore: number | null; groupMinRank: number | null }[];
    }>();

    for (const record of records) {
      const key = [
        record.universityId,
        record.majorCode,
        record.groupCode,
        record.batch,
        record.recruitType,
        record.subjects,
      ].join(':');

      if (!groups.has(key)) {
        groups.set(key, {
          university: record.university,
          major: record.major,
          majorCode: record.majorCode,
          majorName: record.majorName,
          groupCode: record.groupCode,
          batch: record.batch,
          subjects: record.subjects,
          recruitType: record.recruitType,
          yearlyData: [],
        });
      }

      groups.get(key)!.yearlyData.push({
        majorMinScore: record.majorMinScore,
        majorMinRank: record.majorMinRank,
        groupMinScore: record.groupMinScore,
        groupMinRank: record.groupMinRank,
      });
    }

    // 按"最近年份最佳可用分数/位次"排序（取消分页，整段返回）
    const allGroups = Array.from(groups.values());
    allGroups.sort((a, b) => {
      if (score != null) {
        const aScore = this.getBestScore(a.yearlyData);
        const bScore = this.getBestScore(b.yearlyData);
        return (bScore ?? 0) - (aScore ?? 0); // 按分数降序
      }
      const aRank = this.getBestRank(a.yearlyData);
      const bRank = this.getBestRank(b.yearlyData);
      return (aRank ?? Infinity) - (bRank ?? Infinity); // 按位次升序
    });

    const limited = allGroups.slice(0, 500);

    // 注入 predictedMinRank — 同一专业组的所有专业共享一条预测。
    const targetYear = getTargetYear();
    const preds = limited.length
      ? await this.prisma.rankPrediction.findMany({
          where: {
            targetYear,
            OR: limited.map((g) => ({
              universityId: g.university.id,
              groupCode: g.groupCode,
              batch: g.batch,
              recruitType: g.recruitType,
              subjects: g.subjects,
            })),
          },
        })
      : [];

    const predMap = new Map<string, (typeof preds)[number]>();
    for (const p of preds) {
      const k = [p.universityId, p.groupCode, p.batch, p.recruitType, p.subjects].join('|');
      predMap.set(k, p);
    }

    const data: AggregatedAdmissionListItem[] = limited.map((g) => {
      const k = [g.university.id, g.groupCode, g.batch, g.recruitType, g.subjects].join('|');
      const pred = predMap.get(k);
      return {
        university: g.university,
        major: g.major,
        majorCode: g.majorCode,
        majorName: g.majorName,
        groupCode: g.groupCode,
        batch: g.batch,
        subjects: g.subjects,
        recruitType: g.recruitType,
        predictedMinRank: pred
          ? {
              point: pred.pointRank!,
              conservative: pred.conservativeRank!,
              optimistic: pred.optimisticRank!,
              basisYears: pred.basisYears as number[],
              confidence: pred.confidence as 'high' | 'medium' | 'low',
              targetYear: pred.targetYear,
            }
          : null,
      };
    });

    return { data, total: data.length };
  }

  /**
   * Read targetYear from config — exposed as a method so other services can call.
   * Wraps the existing module-level getTargetYear() helper.
   */
  async getTargetYear(): Promise<number> {
    return getTargetYear();
  }

  /**
   * Batch lookup of RankPrediction by natural-key tuples.
   * Used by other services (university, major, plan endpoints) that need to
   * inject predictedMinRank without rebuilding the query each time.
   *
   * Returns a Map from "uniId|groupCode|batch|recruitType|subjects" → prediction object.
   */
  async lookupPredictionsByKeys(
    keys: Array<{
      universityId: number;
      groupCode: string;
      batch: string;
      recruitType: string;
      subjects: string;
    }>,
    targetYearOverride?: number,
  ): Promise<Map<string, {
    point: number;
    conservative: number;
    optimistic: number;
    basisYears: number[];
    confidence: string;
    targetYear: number;
  }>> {
    if (keys.length === 0) return new Map();

    const targetYear = targetYearOverride ?? (await this.getTargetYear());

    const preds = await this.prisma.rankPrediction.findMany({
      where: {
        targetYear,
        OR: keys.map((k) => ({
          universityId: k.universityId,
          groupCode: k.groupCode,
          batch: k.batch,
          recruitType: k.recruitType,
          subjects: k.subjects,
        })),
      },
    });

    const result = new Map<string, {
      point: number;
      conservative: number;
      optimistic: number;
      basisYears: number[];
      confidence: string;
      targetYear: number;
    }>();
    for (const p of preds) {
      const k = [p.universityId, p.groupCode, p.batch, p.recruitType, p.subjects].join('|');
      result.set(k, {
        point: p.pointRank!,
        conservative: p.conservativeRank!,
        optimistic: p.optimisticRank!,
        basisYears: p.basisYears as number[],
        confidence: p.confidence,
        targetYear: p.targetYear,
      });
    }
    return result;
  }

  // 取最新年份的最佳可用分数（majorMinScore 优先，groupMinScore 兜底）
  private getBestScore(yearlyData: any[]): number | null {
    if (yearlyData.length === 0) return null;
    // yearlyData 已按年份降序排列
    for (const yd of yearlyData) {
      if (yd.majorMinScore != null) return yd.majorMinScore;
      if (yd.groupMinScore != null) return yd.groupMinScore;
    }
    return null;
  }

  // 取最新年份的最佳可用位次（majorMinRank 优先，groupMinRank 兜底）
  private getBestRank(yearlyData: any[]): number | null {
    if (yearlyData.length === 0) return null;
    for (const yd of yearlyData) {
      if (yd.majorMinRank != null) return yd.majorMinRank;
      if (yd.groupMinRank != null) return yd.groupMinRank;
    }
    return null;
  }
}
