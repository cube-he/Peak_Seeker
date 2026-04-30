import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RushSafeStableConfig } from '../score-segment/score-segment.service';

export const RUSH_SAFE_STABLE_KEY = 'rush_safe_stable_thresholds';

export const DEFAULT_THRESHOLDS: RushSafeStableConfig = {
  rush: { min: 0.85, max: 0.95 },
  safe: { min: 0.95, max: 1.05 },
  stable: { min: 1.05, max: 1.20 },
};

@Injectable()
export class AlgorithmConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getRushSafeStableThresholds(): Promise<RushSafeStableConfig> {
    const row = await this.prisma.systemConfig.findUnique({
      where: { key: RUSH_SAFE_STABLE_KEY },
    });
    return (row?.value as RushSafeStableConfig | undefined) ?? DEFAULT_THRESHOLDS;
  }

  async setRushSafeStableThresholds(value: RushSafeStableConfig): Promise<void> {
    this.validateThresholds(value);
    await this.prisma.systemConfig.upsert({
      where: { key: RUSH_SAFE_STABLE_KEY },
      create: {
        key: RUSH_SAFE_STABLE_KEY,
        value: value as any,
        desc: '冲稳保 ratio 区间配置（ratio = 院校历史最低位次 / 学生位次）',
      },
      update: { value: value as any },
    });
  }

  private validateThresholds(v: RushSafeStableConfig) {
    const { rush, safe, stable } = v;
    if (!(rush.min < rush.max)) throw new BadRequestException('rush.min 必须 < rush.max');
    if (!(safe.min < safe.max)) throw new BadRequestException('safe.min 必须 < safe.max');
    if (!(stable.min < stable.max)) throw new BadRequestException('stable.min 必须 < stable.max');
    if (rush.max !== safe.min) throw new BadRequestException('safe.min 必须等于 rush.max（区间需连续）');
    if (safe.max !== stable.min) throw new BadRequestException('stable.min 必须等于 safe.max（区间需连续）');
    if (rush.min < 0 || stable.max > 5) throw new BadRequestException('阈值需在合理范围 [0, 5]');
  }
}
