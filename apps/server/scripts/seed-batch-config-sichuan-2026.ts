/**
 * Seed batch_configs for 四川 2026 — 按官方《关于做好我省2026年普通高校招生工作的通知》
 * 19 步投档顺序 + 各批次志愿数 / 调档比例 / 加分例外 / 降分上限。
 *
 * Idempotent (upsert by [year, province, batch, exam_type]).
 *
 * Usage: cd apps/server && pnpm ts-node scripts/seed-batch-config-sichuan-2026.ts
 *
 * Source: https://www.sceea.cn/Html/202604/Newsdetail_4767.html
 * Vault: 10-Projects/VolunteerHelper/domain/sichuan-2026-policy.md
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const YEAR = 2026;
const PROVINCE = '四川';

// 同分排序规则（普通类 6 阶比较器）
const TIEBREAK_NORMAL = {
  primary: 'totalScoreWithBonus',
  steps: ['chineseMathSum', 'chineseMathMax', 'english', 'firstChoice', 'reChoiceMax', 'reChoiceSecond'],
};
// 艺术类同分：综合成绩 → 专业统考 → 文化(含加分) → 普通类规则
const TIEBREAK_ART = {
  primary: 'compositeScore',
  steps: ['provincialMajorExam', 'totalScoreWithBonus', '...TIEBREAK_NORMAL'],
};
// 体育类同分：专业统考 → 文化(含加分) → 普通类规则
const TIEBREAK_SPORT = {
  primary: 'provincialMajorExam',
  steps: ['totalScoreWithBonus', '...TIEBREAK_NORMAL'],
};

interface BatchTemplate {
  batch: string;
  examTypes: string[]; // 拆成几行；e.g. ['物理','历史'] 或 ['不分科目'] 或 ['藏文','彝文']
  volunteerMode: 'parallel' | 'sequential' | 'mixed'; // mixed 用于"1 顺序 + 2 平行"
  maxGroupCount: number; // 院校专业组数（mixed 时为总数：1+2=3）
  maxMajorPerGroup: number; // 统一为 6
  hasAdjustOption: boolean;
  filingRatio: string; // '1:1' / '≤120%'
  admissionOrder: number; // 1–19 投档顺序
  description: string;
  tiebreakRules: any;
  bonusEligible: boolean; // 该批次是否享受加分
  discountAllowed: number; // 该批次允许降分上限（分）；0 = 不可降
}

const BATCHES: BatchTemplate[] = [
  // 1. 强基计划（本科提前批前）
  {
    batch: '强基计划',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 0, // 校测
    maxMajorPerGroup: 0,
    hasAdjustOption: false,
    filingRatio: '校测',
    admissionOrder: 1,
    description: '强基计划由高校校测，安排在本科提前批前投档录取',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false, // 不分省计划
    discountAllowed: 0,
  },
  // 2. 艺术本科提前批（顺序，校考/省际联考）
  {
    batch: '艺术本科提前批',
    examTypes: ['不分科目'],
    volunteerMode: 'sequential',
    maxGroupCount: 1,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 2,
    description: '少数组织校考的高校艺术类本科专业 + 戏曲类省际联考本科专业',
    tiebreakRules: TIEBREAK_ART,
    bonusEligible: false,
    discountAllowed: 0,
  },
  // 3. 普通本科提前批国家专项
  {
    batch: '本科提前批国家专项',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 6,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 3,
    description: '面向农村和脱贫地区国家专项计划；往年放弃后不再具有报考资格',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 4. 普通本科提前批 A 段（顺序：1+2）
  {
    batch: '本科提前批A段',
    examTypes: ['物理', '历史'],
    volunteerMode: 'mixed',
    maxGroupCount: 3, // 1 第一志愿 + 2 平行第二志愿
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 4,
    description: '飞行技术、军事类、公安类、司法类、航海类、消防救援、高校综合评价',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 5. 普通本科提前批高校专项
  {
    batch: '本科提前批高校专项',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 6,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 5,
    description: '高校专项计划',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 6. 艺术本科批
  {
    batch: '艺术本科批',
    examTypes: ['不分科目'],
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 6,
    description: '使用省级专业统考成绩作为专业考试成绩的艺术类本科专业',
    tiebreakRules: TIEBREAK_ART,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 6. 体育本科批（与艺术本科批同 admission_order）
  {
    batch: '体育本科批',
    examTypes: ['不分科目'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 6,
    description: '使用省级专业统考成绩作为专业考试成绩的体育类本科专业',
    tiebreakRules: TIEBREAK_SPORT,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 7. 普通本科提前批 B 段（30 平行）
  {
    batch: '本科提前批B段',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 30,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 7,
    description: '国家公费师范生、国家优师专项、农村订单定向医学生、省级公费师范生、地方优师计划、马院、小语种、少民预科、香港中文大学等',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 20, // 农村医学定向 20 分内可降；其他 0（专业级再过滤）
  },
  // 8. 普通本科批高校专项
  {
    batch: '本科批高校专项',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 8,
    description: '本科批高校专项计划',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 9-1. 本科批 A 段·国家专项
  {
    batch: '本科批A段（国家专项）',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 9,
    description: '本科批国家专项计划',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 9-2. 本科批 A 段·地方专项
  {
    batch: '本科批A段（地方专项）',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 9,
    description: '本科批地方专项计划',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 10. 高水平运动队（顺序，1 院校组）
  {
    batch: '本科批高水平运动队',
    examTypes: ['物理', '历史'],
    volunteerMode: 'sequential',
    maxGroupCount: 1,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 10,
    description: '高水平运动队；高考文化达本科批控线 80% 或部分双一流达本科批控线',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false, // 高水平运动队不享受加分
    discountAllowed: 20,  // 录取线下 20 分以内（限对应专业）
  },
  // 11. 普通本科批 B 段（45 平行）
  {
    batch: '本科批B段',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 11,
    description: '本科提前批及本科批A段以外的本科招生（含部委属/外省少民预科、边防军人子女预科、川大国防预科、民族班、定向、区域均衡、艺术普通类、香港珠海等）',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 20, // 区域均衡发展专项 20 分；其他 0（专业级再过滤）
  },
  // 12. 民语为主本科（含预科）
  {
    batch: '民语为主本科（含预科）',
    examTypes: ['藏文', '彝文'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 12,
    description: '民族语言授课为主本科批次（含预科）；不享受任何加分',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false,
    discountAllowed: 80, // 民语预科 -80
  },
  // 13. 加授民文本科
  {
    batch: '加授民文本科',
    examTypes: ['藏文', '彝文'],
    volunteerMode: 'parallel',
    maxGroupCount: 6,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 13,
    description: '加授民族语文本科批次；不享受任何加分',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false,
    discountAllowed: 0,
  },
  // 14. 省属高校少民预科
  {
    batch: '省属高校少民预科',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 14,
    description: '仅招三州十七县两区少数民族；户籍须 2023-08-31 前已在当地；预科不享受任何加分',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false,
    discountAllowed: 80,
  },
  // 15. 艺术高职批
  {
    batch: '艺术高职批',
    examTypes: ['不分科目'],
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 15,
    description: '使用省级专业统考成绩作为专业考试成绩的艺术类高职专业',
    tiebreakRules: TIEBREAK_ART,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 15. 体育高职批
  {
    batch: '体育高职批',
    examTypes: ['不分科目'],
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 15,
    description: '使用省级专业统考成绩作为专业考试成绩的体育类高职专业',
    tiebreakRules: TIEBREAK_SPORT,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 16. 普通高职提前批
  {
    batch: '高职提前批',
    examTypes: ['物理', '历史'],
    volunteerMode: 'mixed',
    maxGroupCount: 3, // 1+2
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 16,
    description: '定向培养军士、公安类、司法类、航海类等',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 17. 普通高职批（45 平行）
  {
    batch: '高职批',
    examTypes: ['物理', '历史'],
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 17,
    description: '高职提前批以外的其他高职专业',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: true,
    discountAllowed: 0,
  },
  // 18. 民语为主高职
  {
    batch: '民语为主高职',
    examTypes: ['藏文', '彝文'],
    volunteerMode: 'parallel',
    maxGroupCount: 6,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 18,
    description: '民族语言授课为主高职批次；不享受任何加分',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false,
    discountAllowed: 0,
  },
  // 19. 加授民文高职
  {
    batch: '加授民文高职',
    examTypes: ['藏文', '彝文'],
    volunteerMode: 'parallel',
    maxGroupCount: 6,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 19,
    description: '加授民族语文高职批次；不享受任何加分',
    tiebreakRules: TIEBREAK_NORMAL,
    bonusEligible: false,
    discountAllowed: 0,
  },
];

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });

  let upserted = 0;
  for (const tpl of BATCHES) {
    for (const examType of tpl.examTypes) {
      await prisma.batchConfig.upsert({
        where: {
          year_province_batch_examType: {
            year: YEAR,
            province: PROVINCE,
            batch: tpl.batch,
            examType,
          },
        },
        create: {
          year: YEAR,
          province: PROVINCE,
          batch: tpl.batch,
          examType,
          volunteerMode: tpl.volunteerMode,
          maxGroupCount: tpl.maxGroupCount,
          maxMajorPerGroup: tpl.maxMajorPerGroup,
          hasAdjustOption: tpl.hasAdjustOption,
          filingRatio: tpl.filingRatio,
          admissionOrder: tpl.admissionOrder,
          description: tpl.description,
          tiebreakRules: tpl.tiebreakRules,
          bonusEligible: tpl.bonusEligible,
          discountAllowed: tpl.discountAllowed,
        },
        update: {
          volunteerMode: tpl.volunteerMode,
          maxGroupCount: tpl.maxGroupCount,
          maxMajorPerGroup: tpl.maxMajorPerGroup,
          hasAdjustOption: tpl.hasAdjustOption,
          filingRatio: tpl.filingRatio,
          admissionOrder: tpl.admissionOrder,
          description: tpl.description,
          tiebreakRules: tpl.tiebreakRules,
          bonusEligible: tpl.bonusEligible,
          discountAllowed: tpl.discountAllowed,
        },
      });
      upserted++;
    }
  }

  console.log(`[seed-batch-config] upserted ${upserted} rows for ${PROVINCE} ${YEAR}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
