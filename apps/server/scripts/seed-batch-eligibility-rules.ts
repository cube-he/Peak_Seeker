/**
 * Plan: batch recommendation page Task 4
 * 把 6 主批次的 eligibilityRules JSON (含 subsets) 写入 batch_configs 表
 *
 * 数据源:
 *   - 子类别规则: docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 五
 *   - 县名单 seed: data/seed/batch-region-counties.json
 *
 * 用法 (生产服):
 *   cd /home/ubuntu/apps/volunteer-helper/apps/server && \
 *   set -a && . ./.env && set +a && \
 *   ts-node --transpileOnly scripts/seed-batch-eligibility-rules.ts
 *
 * 幂等: 每次跑都全量 update, 可重复执行。
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter } as any);

const COUNTIES_JSON_PATH = join(__dirname, '../../../data/seed/batch-region-counties.json');

function flatten(json: any, key: string): string[] {
  return Object.values(json[key].counties).flat() as string[];
}

const counties = JSON.parse(readFileSync(COUNTIES_JSON_PATH, 'utf-8'));
const REGION_119 = flatten(counties, 'appendix_2_119');
const REGION_143 = flatten(counties, 'appendix_4_143');
const REGION_88 = flatten(counties, 'appendix_5_88');

if (REGION_119.length !== 119) throw new Error(`119 expected, got ${REGION_119.length}`);
if (REGION_143.length !== 143) throw new Error(`143 expected, got ${REGION_143.length}`);
if (REGION_88.length !== 88) throw new Error(`88 expected, got ${REGION_88.length}`);

// 公共文件 references (复用)
const ref_119 = {
  title: '四川省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区 119 县名单',
  filename: 'policy_6_119_counties.xlsx',
  type: 'xlsx' as const,
};
const ref_143 = {
  title: '四川省 2024 省级公费师范生范围 143 县名单',
  filename: 'policy_2_143_shifan.xlsx',
  type: 'xlsx' as const,
};
const ref_88 = {
  title: '四川省乡村振兴 88 县名单',
  filename: 'policy_5_88_xiangcun.xlsx',
  type: 'xlsx' as const,
};
const ref_zhaosheng_wuli = {
  title: '招生考试报 2025 物理类前言+附件',
  filename: 'zhaosheng_2025_wuli_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_zhaosheng_lishi = {
  title: '招生考试报 2025 历史类前言+附件',
  filename: 'zhaosheng_2025_lishi_qianyan.pdf',
  type: 'pdf' as const,
};
const ref_junjian = {
  title: '军队选拔军官和文职人员体检标准',
  filename: 'junjian_tijian.pdf',
  type: 'pdf' as const,
};

const RULES: Record<string, any> = {
  本科批A段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_a',
        name: '普通类',
        description: '一般本科, 无特殊资格要求',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'guojia_zhuanxiang',
        name: '国家专项计划',
        description: '面向原贫困地区, 招收农村学生进重点高校',
        hardRules: [
          {
            scope: 'SUBSET', subset: '国家专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        softHints: ['户籍连续 3 年 + 学籍连续 3 年, 老师核实'],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'difang_zhuanxiang',
        name: '地方专项计划',
        description: '省属高校招收本省农村学生',
        hardRules: [
          {
            scope: 'SUBSET', subset: '地方专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'gaoshui_yundong',
        name: '高水平运动队',
        description: '具有运动员等级证书的考生',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科批B段: {
    scoreFloor: { type: 'BATCH_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_b',
        name: '普通类',
        description: '一般本科 B 段, 部分原二本院校',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'gaoxiao_zhuanxiang',
        name: '高校专项计划',
        description: '部分高校单列, 农村学生重点支持',
        hardRules: [
          {
            scope: 'SUBSET', subset: '高校专项',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
        ],
        softHints: ['中学校长实名推荐, 通过高校审核, 老师核实'],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'zhongwai_hezuo',
        name: '中外合作办学',
        description: '高学费, 通常是国内+海外联合培养',
        dataPending: true,
        references: [],
      },
      {
        code: 'yingyong_benke',
        name: '应用型本科',
        description: '部分高职升级的应用型本科专业',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科提前批A段: {
    scoreFloor: { type: 'SPECIAL_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'junxiao',
        name: '军队院校',
        description: '军队 27 院校, 录取后入伍',
        hardRules: [
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 20, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '军队院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        softHints: ['需通过体能测试, 体重身高视力具体标准看军检 PDF, 老师跟家长核实'],
        references: [ref_junjian, ref_zhaosheng_wuli],
      },
      {
        code: 'gongan',
        name: '公安院校',
        description: '公安部直属院校, 政考要求高',
        hardRules: [
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'AGE_RANGE',
            params: { min: 16, max: 22, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '公安院校',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'sifa',
        name: '司法警官类',
        description: '司法部院校, 警务方向',
        hardRules: [
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '司法警官',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'hanghai',
        name: '航海类',
        description: '航海技术、轮机工程等专业, 视力色觉要求',
        hardRules: [
          {
            scope: 'SUBSET', subset: '航海类',
            rule: 'VISION_STANDARD',
          },
        ],
        softHints: ['裸眼视力 4.7 以上 + 无色盲色弱, 体检表参考招生章程'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'liuxue_dingxiang',
        name: '留学/留俄定向',
        description: '部分院校与海外大学联合培养',
        dataPending: true,
        references: [],
      },
      {
        code: 'gaoxiao_zonghe',
        name: '高校综合评价 (北电中传等)',
        description: '艺术综合评价, 单独招生流程',
        dataPending: true,
        references: [],
      },
    ],
  },
  本科提前批B段: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 20 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'mianfei_yixue',
        name: '免费医学 (农村订单定向)',
        description: '5+3 全科医师定向培养, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '免费医学',
            rule: 'RURAL_HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
          {
            scope: 'SUBSET', subset: '免费医学',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'sheng_gongfei_shifan',
        name: '省级公费师范生',
        description: '面向本省农村中小学, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '省级公费师范',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_143 },
          },
          {
            scope: 'SUBSET', subset: '省级公费师范',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_143, ref_zhaosheng_wuli],
      },
      {
        code: 'bushu_shifan',
        name: '部属师范本研衔接公费',
        description: '教育部直属 6 师范, 本研衔接, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '部属师范',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_119 },
          },
          {
            scope: 'SUBSET', subset: '部属师范',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_119, ref_zhaosheng_wuli],
      },
      {
        code: 'xiangcun_zhenxing',
        name: '乡村振兴师范',
        description: '面向乡村振兴重点县, 服务期 6 年',
        hardRules: [
          {
            scope: 'SUBSET', subset: '乡村振兴',
            rule: 'HOUSEHOLD_IN_REGION',
            params: { regions: REGION_88 },
          },
          {
            scope: 'SUBSET', subset: '乡村振兴',
            rule: 'SERVICE_COMMITMENT',
            params: { years: 6 },
          },
        ],
        references: [ref_88, ref_zhaosheng_wuli],
      },
    ],
  },
  高职提前批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [
      {
        code: 'dingxiang_junshi',
        name: '定向培养军士',
        description: '部分高职院校面向陆海空军方向培养',
        hardRules: [
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'AGE_RANGE',
            params: { min: 17, max: 22, asOf: '2025-08-31' },
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'POLITICAL_REVIEW_REQUIRED',
          },
          {
            scope: 'SUBSET', subset: '定向军士',
            rule: 'PHYSICAL_EXAM_REQUIRED',
          },
        ],
        references: [ref_junjian, ref_zhaosheng_wuli],
      },
      {
        code: 'kongcheng',
        name: '空中乘务',
        description: '高职空乘专业, 身高/视力/面试',
        hardRules: [
          {
            scope: 'SUBSET', subset: '空乘',
            rule: 'VISION_STANDARD',
          },
        ],
        softHints: ['男生身高 172cm 以上, 女生 162cm 以上 + 面试合格'],
        references: [ref_zhaosheng_wuli],
      },
      {
        code: 'gongan_zhuanke',
        name: '公安专科',
        description: '公安类高职, 同公安院校政考要求',
        dataPending: true,
        references: [],
      },
      {
        code: 'sifa_jingyuan',
        name: '司法警院',
        description: '司法系统专科警院',
        dataPending: true,
        references: [],
      },
      {
        code: 'wunianyi',
        name: '五年制大专',
        description: '初中毕业起的五年一贯制',
        dataPending: true,
        references: [],
      },
    ],
  },
  高职批: {
    scoreFloor: { type: 'ZHUANKE_LINE' },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [
      {
        code: 'puton_zhuan',
        name: '普通高职',
        description: '常规专科, 无特殊资格',
        hardRules: [],
        references: [ref_zhaosheng_wuli, ref_zhaosheng_lishi],
      },
      {
        code: 'zhongwai_zhuan',
        name: '中外合作办学高职',
        description: '高学费, 海外学位衔接',
        dataPending: true,
        references: [],
      },
    ],
  },
};

// DB 中实际存在的细分批次名 → 共享哪个顶层规则
// 但每个细分批次卡片只展示自己专属的 subset, 避免 4 张本科批 A 卡片重复显示
// 解决 Plan A Task 12 遗留: DB 有"本科批A段（国家专项）"等细分行而无纯"本科批A段"
const BATCH_ALIASES: Array<{ alias: string; parent: string; onlySubsets: string[] }> = [
  { alias: '本科批A段（国家专项）', parent: '本科批A段', onlySubsets: ['guojia_zhuanxiang'] },
  { alias: '本科批A段（地方专项）', parent: '本科批A段', onlySubsets: ['difang_zhuanxiang'] },
  { alias: '本科批高校专项', parent: '本科批B段', onlySubsets: ['gaoxiao_zhuanxiang'] },
  { alias: '本科批高水平运动队', parent: '本科批A段', onlySubsets: ['gaoshui_yundong'] },
  { alias: '本科提前批国家专项', parent: '本科批A段', onlySubsets: ['guojia_zhuanxiang'] },
  { alias: '本科提前批高校专项', parent: '本科批B段', onlySubsets: ['gaoxiao_zhuanxiang'] },
];

// 完全独立的占位批次 (只填 dataPending placeholder)
const PLACEHOLDER_BATCHES: Record<string, any> = {
  强基计划: {
    scoreFloor: { type: 'SPECIAL_LINE' },  // 强基用特殊类型线 518, 不是本科线
    examTypes: ['物理', '历史'],
    volunteerMode: 'SEQUENTIAL',
    hardEligibility: [],
    subsets: [{
      code: 'qiangji',
      name: '强基计划',
      description: '基础学科拔尖人才, 5+3 校测综合评价, 单独申报',
      dataPending: true,
      references: [],
    }],
  },
  省属高校少民预科: {
    scoreFloor: { type: 'BATCH_LINE', leniency: 80 },
    examTypes: ['物理', '历史'],
    volunteerMode: 'PARALLEL',
    hardEligibility: [],
    subsets: [{
      code: 'shaomin_yuke',
      name: '省属高校少数民族预科',
      description: '少数民族考生 + 户籍县在特定区域, 预科 1 年 + 本科',
      dataPending: true,
      references: [],
    }],
  },
};

async function main() {
  console.log('Seeding batch recommendation rules (V2 subsets) for 四川 year=2026...');
  console.log(`Regions: 119/${REGION_119.length} 143/${REGION_143.length} 88/${REGION_88.length}`);
  let updated = 0;
  // 合并 RULES + PLACEHOLDER_BATCHES + aliases 后, 一次循环 update
  // alias 批次只展示自己的 subset (避免老师看 4 张本科批 A 重复卡片)
  const allTargets: Array<{ batch: string; rules: any }> = [];
  for (const [batch, rules] of Object.entries(RULES)) {
    allTargets.push({ batch, rules });
  }
  for (const { alias, parent, onlySubsets } of BATCH_ALIASES) {
    const parentRules = RULES[parent];
    if (!parentRules) {
      console.warn(`⚠ alias "${alias}" 找不到 parent "${parent}"`);
      continue;
    }
    const filteredSubsets = parentRules.subsets.filter((s: any) => onlySubsets.includes(s.code));
    if (filteredSubsets.length === 0) {
      console.warn(`⚠ alias "${alias}" 在 parent "${parent}" 下找不到任意 onlySubsets=${onlySubsets.join(',')}`);
      continue;
    }
    allTargets.push({
      batch: alias,
      rules: { ...parentRules, subsets: filteredSubsets },
    });
  }
  for (const [batch, rules] of Object.entries(PLACEHOLDER_BATCHES)) {
    allTargets.push({ batch, rules });
  }
  for (const { batch, rules } of allTargets) {
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
      const subsetCount = rules.subsets?.length ?? 0;
      console.log(`✓ updated batch_configs[id=${cfg.id}] ${batch} / ${cfg.examType} (${subsetCount} subsets)`);
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
