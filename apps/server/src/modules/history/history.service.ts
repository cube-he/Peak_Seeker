import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: number, type?: string, limit = 50) {
    const where: any = { userId };
    if (type) where.searchType = type;

    return this.prisma.searchHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async add(userId: number, data: {
    type: string;
    params: any;
    resultCount?: number;
  }) {
    return this.prisma.searchHistory.create({
      data: {
        userId,
        searchType: data.type,
        searchParams: data.params,
        resultCount: data.resultCount,
      },
    });
  }
}
