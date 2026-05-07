import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BatchPickerOption {
  /** 批次名（同时也是 value，多省份扩展友好） */
  code: string;
  name: string;
  /** 录取顺序，前端按此排序 */
  order: number;
}

@Injectable()
export class BatchConfigService {
  constructor(private prisma: PrismaService) {}

  async getPickerOptions(year: number, province: string): Promise<BatchPickerOption[]> {
    const rows = await this.prisma.batchConfig.findMany({
      where: { year, province },
      select: { batch: true, admissionOrder: true },
    });
    // 同一 batch 在物理 / 历史下可能各有一行，按 batch 名去重
    const map = new Map<string, BatchPickerOption>();
    for (const r of rows) {
      if (!map.has(r.batch)) {
        map.set(r.batch, { code: r.batch, name: r.batch, order: r.admissionOrder });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }
}
