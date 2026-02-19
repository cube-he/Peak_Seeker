import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
}
