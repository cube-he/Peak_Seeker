import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FavoriteService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: number, type?: string) {
    const where: any = { userId };
    if (type) where.favoriteType = type;

    return this.prisma.favorite.findMany({
      where,
      include: {
        university: true,
        major: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(userId: number, data: {
    type: string;
    universityId?: number;
    majorId?: number;
    notes?: string;
  }) {
    const existing = await this.prisma.favorite.findFirst({
      where: {
        userId,
        favoriteType: data.type,
        universityId: data.universityId,
        majorId: data.majorId,
      },
    });

    if (existing) {
      throw new ConflictException('已收藏');
    }

    return this.prisma.favorite.create({
      data: {
        userId,
        favoriteType: data.type,
        universityId: data.universityId,
        majorId: data.majorId,
        notes: data.notes,
      },
    });
  }

  async remove(id: number, userId: number) {
    return this.prisma.favorite.deleteMany({
      where: { id, userId },
    });
  }
}
