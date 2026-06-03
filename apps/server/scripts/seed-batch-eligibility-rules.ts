/**
 * Plan A Task 6: 把 6 批次的 eligibilityRules JSON 写入 batch_configs 表
 *
 * 数据源:
 *   - 6 批次规则: docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 二、六
 *   - 县名单 seed: data/seed/batch-region-counties.json (附件 2/4/5)
 *
 * 用法 (生产服):
 *   cd /home/ubuntu/apps/volunteer-helper && \
 *   pnpm exec ts-node apps/server/scripts/seed-batch-eligibility-rules.ts
 *
 * 用法 (本地, 需 .env.local 或 DATABASE_URL 指向本地 DB):
 *   cd apps/server && pnpm exec ts-node scripts/seed-batch-eligibility-rules.ts
 *
 * 幂等:每次跑都全量 update,可重复执行。
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';

// 内联类型(脚本独立, 不依赖 src/ 编译,生产服只下 dist/ 也能跑)
type EligibilityRulesJson = {
  scoreFloor: { type: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE'; leniency?: number };
  examTypes: string[];
  volunteerMode: 'PARALLEL' | 'SEQUENTIAL';
  hardEligibility: Array<{
    scope: 'ALL' | 'SUBSET';
    subset?: string;
    rule: string;
    params?: Record<string, unknown>;
  }>;
  softRecommendation?: Array<{ rule: string; message: string }>;
};

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter } as any);

// 县名单 JSON: 从 repo 根目录的 data/seed/ 读
const COUNTIES_JSON_PATH = join(__dirname, '../../../data/seed/batch-region-counties.json');

function flatten(json: any, appendixKey: string): string[] {
  const countiesByCity = json[appendixKey].counties;
  return Object.values(countiesByCity).flat() as string[];
}

const counties = JSON.parse(readFileSync(COUNTIES_JSON_PATH, 'utf-8'));
const REGION_119 = flatten(counties, 'appendix_2_119');
const REGION_143 = flatten(counties, 'appendix_4_143');
const REGION_88 = flatten(counties, 'appendix_5_88');

// 校验县名单数量与公告一致(防止 seed 时数据被改坏)
if (REGION_119.length !== 119) throw new Error(`appendix_2_119 expects 119 got ${REGION_119.length}`);
if (REGION_143.length !== 143) throw new Error(`appendix_4_143 expects 143 got ${REGION_143.length}`);
if (REGION_88.length !== 88) throw new Error(`appendix_5_88 expects 88 got ${REGION_88.length}`);

const RULES: Record<string, any> = {
  本科批A段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '国家专项',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
      {
        scope: 'SUBSET',
        subset: '地方专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
    ],
  },
  本科批B段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '高校专项',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
    ],
  },
  本科提前批A段: {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '军队院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 20, asOf: '2025-08-31' },
      },
      {
        scope: 'SUBSET',
        subset: '公安院校',
        rule: 'AGE_RANGE',
        params: { min: 16, max: 22, asOf: '2025-08-31' },
      },
      {
        scope: 'SUBSET',
        subset: '军队院校',
        rule: 'POLITICAL_REVIEW_REQUIRED',
      },
      {
        scope: 'SUBSET',
        subset: '公安院校',
        rule: 'POLITICAL_REVIEW_REQUIRED',
      },
    ],
    softRecommendation: [
      { rule: 'PHYSICAL_EXAM_NOTICE', message: '军校 / 警校 / 司法 / 航海 / 消防 等子类需通过体检, 请老师核实' },
    ],
  },
  本科提前批B段: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [
      {
        scope: 'SUBSET',
        subset: '免费医学',
        rule: 'RURAL_HOUSEHOLD_IN_REGION',
        params: { regions: REGION_119 },
      },
      {
        scope: 'SUBSET',
        subset: '省级公费师范',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_143 },
      },
      {
        scope: 'SUBSET',
        subset: '乡村振兴',
        rule: 'HOUSEHOLD_IN_REGION',
        params: { regions: REGION_88 },
      },
    ],
  },
  高职提前批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    softRecommendation: [
      { rule: 'POLITICAL_PHYSICAL_NOTICE', message: '定向军士 / 公安专科 / 司法警院 / 空乘 等子类需政考 / 体检 / 面试, 请老师面谈核实' },
    ],
  },
  高职批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
  },
};

async function main() {
  console.log('Seeding batch eligibility rules for 四川 year=2026...');
  console.log(`Regions: 119/${REGION_119.length} 143/${REGION_143.length} 88/${REGION_88.length}`);
  let updated = 0;
  for (const [batch, rules] of Object.entries(RULES)) {
    const configs = await prisma.batchConfig.findMany({
      where: { batch, province: '四川', year: 2026 },
    });
    if (configs.length === 0) {
      console.warn(`⚠ no batchConfig found for batch="${batch}"`);
      continue;
    }
    for (const cfg of configs) {
      await prisma.batchConfig.update({
        where: { id: cfg.id },
        data: { eligibilityRules: rules as any },
      });
      updated++;
      console.log(`✓ updated batch_configs[id=${cfg.id}] ${batch} / ${cfg.examType}`);
    }
  }
  console.log(`Total updated: ${updated} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
