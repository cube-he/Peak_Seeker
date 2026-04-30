import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { FindAggregatedDto } from './dto/find-aggregated.dto';

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

  async findAggregated(dto: FindAggregatedDto) {
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
      page = 1,
      pageSize = 20,
    } = dto;

    if (score == null && rank == null) {
      throw new BadRequestException('score or rank is required');
    }

    const scoreRange = range ?? 20;
    const rankRange = range ?? 5000;

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

    // 查询所有年份的匹配记录（take: 10000 防 OOM）
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

    // 按 (universityId, majorCode, groupCode, batch, recruitType) 分组
    const groups = new Map<string, {
      university: any;
      major: any;
      majorId: number;
      majorCode: string;
      majorName: string;
      groupCode: string;
      batch: string;
      subjects: string;
      recruitType: string;
      yearlyData: any[];
      currentPlan: any;
      supplementary: any;
    }>();

    for (const record of records) {
      const key = [
        record.universityId,
        record.majorCode,
        record.groupCode,
        record.batch,
        record.recruitType,
      ].join(':');

      if (!groups.has(key)) {
        groups.set(key, {
          university: record.university,
          major: record.major,
          majorId: record.majorId,
          majorCode: record.majorCode,
          majorName: record.majorName,
          groupCode: record.groupCode,
          batch: record.batch,
          subjects: record.subjects,
          recruitType: record.recruitType,
          yearlyData: [],
          currentPlan: null,
          supplementary: null,
        });
      }

      groups.get(key)!.yearlyData.push({
        year: record.year,
        majorMinScore: record.majorMinScore,
        majorMinRank: record.majorMinRank,
        majorAvgScore: record.majorAvgScore,
        majorAvgRank: record.majorAvgRank,
        majorAdmissionCount: record.majorAdmissionCount,
        groupMinScore: record.groupMinScore,
        groupMinRank: record.groupMinRank,
        groupAdmissionCount: record.groupAdmissionCount,
      });
    }

    // 按"最近年份最佳可用分数/位次"排序
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

    const total = allGroups.length;
    const paginatedGroups = allGroups.slice((page - 1) * pageSize, page * pageSize);

    // 仅为当前页的项目查询招生计划
    if (paginatedGroups.length > 0) {
      const uniIds = [...new Set(paginatedGroups.map((g) => g.university.id))];
      const latestPlanYear = new Date().getFullYear();

      const plans = await this.prisma.enrollmentPlan.findMany({
        where: {
          province,
          year: latestPlanYear,
          universityId: { in: uniIds },
          ...(batch && { batch }),
          ...(subjects && { subjects }),
        },
        select: {
          universityId: true,
          majorCode: true,
          groupCode: true,
          batch: true,
          recruitType: true,
          majorName: true,
          planCount: true,
          tuition: true,
          duration: true,
          subjectRequirements: true,
          disciplineEval: true,
          majorRanking: true,
          majorHonor: true,
          localMasterPoint: true,
          localDoctoralPoint: true,
          isNew: true,
          isSinoForeign: true,
          planNotes: true,
        },
      });

      // 用 Map 匹配招生计划到分组
      const planMap = new Map<string, any>();
      for (const plan of plans) {
        const key = [
          plan.universityId,
          plan.majorCode,
          plan.groupCode,
          plan.batch,
          plan.recruitType,
        ].join(':');
        planMap.set(key, plan);
      }

      for (const group of paginatedGroups) {
        const key = [
          group.university.id,
          group.majorCode,
          group.groupCode,
          group.batch,
          group.recruitType,
        ].join(':');
        group.currentPlan = planMap.get(key) ?? null;
      }

      // 查询征集志愿摘要（按 universityId + batch 维度）
      const suppSummaries = await this.prisma.supplementarySummary.findMany({
        where: {
          province,
          universityId: { in: uniIds },
          ...(batch && { batch }),
        },
        select: {
          universityId: true,
          batch: true,
          year: true,
          totalRounds: true,
          totalPlanCount: true,
          supplementaryRate: true,
        },
      });

      // 按 (universityId, batch) 取最近年份的征集摘要
      const suppMap = new Map<string, any>();
      for (const s of suppSummaries) {
        const sKey = `${s.universityId}:${s.batch}`;
        const existing = suppMap.get(sKey);
        if (!existing || s.year > existing.year) {
          suppMap.set(sKey, s);
        }
      }

      for (const group of paginatedGroups) {
        const sKey = `${group.university.id}:${group.batch}`;
        const supp = suppMap.get(sKey);
        if (supp) {
          group.supplementary = {
            totalRounds: supp.totalRounds,
            totalPlanCount: supp.totalPlanCount,
            supplementaryRate: supp.supplementaryRate ? Number(supp.supplementaryRate) : null,
          };
        }
      }
    }

    return {
      data: paginatedGroups,
      pagination: { page, pageSize, total },
    };
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
