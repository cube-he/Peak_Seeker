import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EligibleRegionService {
  constructor(private prisma: PrismaService) {}

  // 按项目类型查询地区资格列表，按 area → county 排序
  async findByProgram(program: string) {
    return this.prisma.eligibleRegion.findMany({
      where: { program },
      orderBy: [{ area: 'asc' }, { county: 'asc' }],
    });
  }

  // 获取所有可用的项目类型（去重），附带 programLabel
  async getPrograms() {
    const all = await this.prisma.eligibleRegion.findMany({
      select: {
        program: true,
        programLabel: true,
      },
    });

    // 按 program 去重，保留首次出现的 programLabel
    const seen = new Map<string, { program: string; programLabel: string }>();
    for (const row of all) {
      if (!seen.has(row.program)) {
        seen.set(row.program, {
          program: row.program,
          programLabel: row.programLabel,
        });
      }
    }

    return Array.from(seen.values());
  }
}
