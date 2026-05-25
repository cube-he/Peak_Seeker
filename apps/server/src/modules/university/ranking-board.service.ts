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
  /** 软科主榜体系（本科/民办/高职）：让前端 caption 准确显示"软科{list} #N"而非误写"全国" */
  softRankList: string | null;
  admissionMinRank: number | null;
  admissionMinScore: number | null;
}

export interface RankingBoard {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: BoardLevel;
  items: RankedUniversity[];
}

@Injectable()
export class RankingBoardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getRankingBoard(examType: string): Promise<RankingBoard[]> {
    const cacheKey = `university:ranking-board:${examType}`;
    const cached = await this.redis.getCache<RankingBoard[]>(cacheKey);
    if (cached) return cached;

    const boards = await Promise.all(
      BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg, examType)),
    );

    await this.redis.setCache(cacheKey, boards, 3600);
    return boards;
  }

  private buildBoardWhere(cfg: BoardConfig): any {
    const where: any = { level: cfg.level };
    // 按区域/精英筛选的榜（川内/周边/发达/全国名校）的 softRanking 必须来自同一个榜单
    // 才能可比——本科 boards 限定 softRankList='本科'（排除民办本科混入,因为民办院校的
    // softRanking 是民办榜内名次,从 1 重新计数,跟综合本科榜不可比）；专科 boards 同理
    // 限定 '高职'。list/category kind 自己已经限制了 softRankList/softCategory,不需要。
    if (cfg.region.kind === 'province') {
      where.province = { in: cfg.region.values };
      where.softRanking = { gt: 0 };
      where.softRankList = cfg.level === '本科' ? '本科' : '高职';
    } else if (cfg.region.kind === 'city') {
      where.city = { in: cfg.region.values };
      where.softRanking = { gt: 0 };
      where.softRankList = cfg.level === '本科' ? '本科' : '高职';
    } else if (cfg.region.kind === 'elite') {
      where.OR = [{ is985: true }, { is211: true }, { isDoubleFirstClass: true }];
      where.softRanking = { gt: 0 };
      where.softRankList = cfg.level === '本科' ? '本科' : '高职';
    } else if (cfg.region.kind === 'category') {
      // 类别榜按 softCategory 过滤（财经/医药/...），用 softCategoryRank 排。
      // 同 softCategory 值在本科/高职体系下分别存在（如本科"财经类"=上海财经,
      // 高职"财经类"=浙江金融职业学院），必须加 softRankList 过滤区分,否则
      // 财经类榜会把本科 + 高职财经类院校混在一起。
      where.softCategory = cfg.region.value;
      where.softCategoryRank = { gt: 0 };
      where.softRankList = cfg.level === '本科' ? '本科' : '高职';
    } else if (cfg.region.kind === 'list') {
      // 民办/高职：按 softRankList 过滤；这两类的 softRanking 就是该榜单内名次
      where.softRankList = cfg.region.value;
      where.softRanking = { gt: 0 };
    }
    return where;
  }

  private async buildBoard(cfg: BoardConfig, examType: string): Promise<RankingBoard> {
    // 类别榜按 softCategoryRank 排（榜单内名次），其余榜按 softRanking 排
    const orderField = cfg.region.kind === 'category' ? 'softCategoryRank' : 'softRanking';

    const universities = await this.prisma.university.findMany({
      where: this.buildBoardWhere(cfg),
      orderBy: { [orderField]: 'asc' },
      select: {
        id: true, name: true, logoUrl: true, province: true, city: true,
        type: true, runningNature: true, is985: true, is211: true,
        isDoubleFirstClass: true, softRanking: true, softRankList: true,
      },
    });

    const admissionMap = await this.fetchAdmissionRanks(
      universities.map((u) => u.id), cfg.level, examType,
    );

    const items: RankedUniversity[] = universities.map((u, idx) => ({
      rank: idx + 1,
      ...u,
      softRanking: u.softRanking ?? 0,
      softRankList: u.softRankList ?? null,
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
      select: {
        universityId: true,
        groupMinRank: true, majorMinRank: true, filingMinRank: true,
        groupMinScore: true, majorMinScore: true, filingMinScore: true,
      },
    });

    // 数据库院校级位次字段(universityMinRank)恒为空；改从专业组/专业/投档位次取值，
    // 对一所院校取位次数最大的一条（= 门槛最宽松、最易进的专业组）作为院校最低录取位次。
    for (const r of records) {
      const rank = r.groupMinRank ?? r.majorMinRank ?? r.filingMinRank;
      if (rank == null) continue;
      const cur = map.get(r.universityId);
      if (!cur || cur.rank == null || rank > cur.rank) {
        map.set(r.universityId, {
          rank,
          score: r.groupMinScore ?? r.majorMinScore ?? r.filingMinScore ?? null,
        });
      }
    }
    return map;
  }
}
