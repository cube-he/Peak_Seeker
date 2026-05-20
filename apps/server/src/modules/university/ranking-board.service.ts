import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BOARD_CONFIGS, BoardConfig, BoardLevel, RECRUIT_TYPE_BY_LEVEL } from './ranking-board.constants';

export interface RankedUniversity {
  rank: number;
  id: number;
  name: string;
  logoUrl: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  softRanking: number;
  admissionMinRank: number | null;
  admissionMinScore: number | null;
}

export interface RankingBoard {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: string;
  items: RankedUniversity[];
}

@Injectable()
export class RankingBoardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getRankingBoard(examType: string): Promise<RankingBoard[]> {
    return Promise.all(BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg, examType)));
  }

  private buildBoardWhere(cfg: BoardConfig): any {
    const where: any = { level: cfg.level, softRanking: { gt: 0 } };
    if (cfg.region.kind === 'province') {
      where.province = { in: cfg.region.values };
    } else if (cfg.region.kind === 'city') {
      where.city = { in: cfg.region.values };
    } else {
      where.OR = [{ is985: true }, { is211: true }, { isDoubleFirstClass: true }];
    }
    return where;
  }

  private async buildBoard(cfg: BoardConfig, examType: string): Promise<RankingBoard> {
    const universities = await this.prisma.university.findMany({
      where: this.buildBoardWhere(cfg),
      orderBy: { softRanking: 'asc' },
      select: {
        id: true, name: true, logoUrl: true, province: true, city: true,
        type: true, runningNature: true, is985: true, is211: true,
        isDoubleFirstClass: true, softRanking: true,
      },
    });

    const admissionMap = await this.fetchAdmissionRanks(
      universities.map((u) => u.id), cfg.level, examType,
    );

    const items: RankedUniversity[] = universities.map((u, idx) => ({
      rank: idx + 1,
      ...u,
      softRanking: u.softRanking ?? 0,
      admissionMinRank: admissionMap.get(u.id)?.rank ?? null,
      admissionMinScore: admissionMap.get(u.id)?.score ?? null,
    }));

    return {
      key: cfg.key, title: cfg.title, groupKey: cfg.groupKey,
      groupTitle: cfg.groupTitle, level: cfg.level, items,
    };
  }

  private async fetchAdmissionRanks(
    universityIds: number[], level: BoardLevel, examType: string,
  ): Promise<Map<number, { rank: number | null; score: number | null }>> {
    const map = new Map<number, { rank: number | null; score: number | null }>();
    if (universityIds.length === 0) return map;

    // 录取数据年份：最近一年（与 university.service.ts findAll 口径一致）。
    // 2025 为四川新高考首年，subjects 即物理/历史，与 examType 直接对应。
    const dataYear = new Date().getFullYear() - 1;

    const records = await this.prisma.admissionRecord.findMany({
      where: {
        universityId: { in: universityIds },
        province: '四川',
        year: dataYear,
        recruitType: RECRUIT_TYPE_BY_LEVEL[level],
        subjects: { contains: examType },
      },
      select: { universityId: true, universityMinRank: true, universityMinScore: true },
      orderBy: { universityMinRank: 'desc' },
    });

    // 同一院校可能有多条批次记录；orderBy desc + 首条写入 = 取最宽松的录取门槛
    for (const r of records) {
      if (!map.has(r.universityId)) {
        map.set(r.universityId, { rank: r.universityMinRank, score: r.universityMinScore });
      }
    }
    return map;
  }
}
