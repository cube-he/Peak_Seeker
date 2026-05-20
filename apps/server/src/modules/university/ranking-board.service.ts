import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BOARD_CONFIGS, BoardConfig } from './ranking-board.constants';

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

  async getRankingBoard(): Promise<RankingBoard[]> {
    return Promise.all(BOARD_CONFIGS.map((cfg) => this.buildBoard(cfg)));
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

  private async buildBoard(cfg: BoardConfig): Promise<RankingBoard> {
    const universities = await this.prisma.university.findMany({
      where: this.buildBoardWhere(cfg),
      orderBy: { softRanking: 'asc' },
      select: {
        id: true, name: true, logoUrl: true, province: true, city: true,
        type: true, runningNature: true, is985: true, is211: true,
        isDoubleFirstClass: true, softRanking: true,
      },
    });

    const items: RankedUniversity[] = universities.map((u, idx) => ({
      rank: idx + 1,
      ...u,
      softRanking: u.softRanking as number,
      admissionMinRank: null,
      admissionMinScore: null,
    }));

    return {
      key: cfg.key, title: cfg.title, groupKey: cfg.groupKey,
      groupTitle: cfg.groupTitle, level: cfg.level, items,
    };
  }
}
