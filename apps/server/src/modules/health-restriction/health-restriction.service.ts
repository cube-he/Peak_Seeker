import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthRestrictionService {
  constructor(private prisma: PrismaService) {}

  // 查询所有体检受限条件，按 conditionCode 去重后返回唯一条件列表
  async getConditionList() {
    const all = await this.prisma.healthRestriction.findMany({
      select: {
        conditionCode: true,
        conditionName: true,
        severity: true,
      },
    });

    // 按 conditionCode 去重，保留首次出现的记录
    const seen = new Map<string, { conditionCode: string; conditionName: string; severity: string }>();
    for (const row of all) {
      if (!seen.has(row.conditionCode)) {
        seen.set(row.conditionCode, {
          conditionCode: row.conditionCode,
          conditionName: row.conditionName,
          severity: row.severity,
        });
      }
    }

    return Array.from(seen.values());
  }
}
