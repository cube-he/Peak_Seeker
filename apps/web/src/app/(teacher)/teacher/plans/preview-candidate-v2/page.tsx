'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Tooltip, Drawer, Checkbox } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  StarFilled,
  PlusOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  EnvironmentOutlined,
  UpOutlined,
  SoundOutlined,
  CloseOutlined,
  BarsOutlined,
} from '@ant-design/icons';
import styles from './candidate-card-v2.module.css';
import { MatchHeader, PrefChip, NotesChip } from '@/components/candidate-pool-v2';

// ============ 类型定义 ============
type Gradient = 'rush' | 'stable' | 'safe';
type MajorSection = 'RECOMMENDED' | 'BACKUP' | 'RISK';

interface YearPoint {
  year: number;
  score: number;
  rank: number;
}

interface SupplementaryRound {
  round: number;
  count: number;
  lineDrop?: number;
  date?: string;
}

interface SupplementaryYear {
  year: number;
  rounds: SupplementaryRound[];
}

interface PreviewMajor {
  name: string;
  code: string;
  ranking: 'A+' | 'A' | 'B+' | 'B' | 'C';
  master: boolean;
  doctoral: boolean;
  planCount: number;
  trend: 'up' | 'down' | 'flat';
  section: MajorSection;
  isNew?: boolean;
  isSino?: boolean;
  isNational?: boolean;
  scores3y: YearPoint[];
  supplementary?: SupplementaryYear[];
  notes?: string;
}

interface PrefMatch {
  province?: 'match' | 'mismatch';      // 本省/外省
  tuition?: 'within' | 'over';           // 学费预算
  career?: 'strong' | 'weak' | 'none';   // 职业方向
  subjects?: 'match' | 'partial' | 'mismatch'; // 选科匹配
}

interface RankPrediction {
  year: number;
  score: number;
  rank: number;
  scoreLow: number;
  scoreHigh: number;
  confidence: 'high' | 'medium' | 'low';
}

interface PreviewCard {
  universityName: string;
  shortName: string;
  tiers: Array<'985' | '211' | 'DFC' | 'PROVINCIAL' | 'BENZHONG'>;
  softRank: number;
  city: string;
  district: string;
  groupName: string;
  groupCode: string;
  subjects: string;
  runningNature: '公办' | '民办' | '中外合办';
  gradient: Gradient;
  gradeLabel: string;
  rankDelta: string;
  rankGapAbs: number;          // 与组最低位次的绝对差（正=学生位次更高=更稳）
  matchScore: number;          // 0-100 匹配度
  matchReason?: string;        // 匹配度的人话解释
  prefMatch: PrefMatch;        // 学生偏好对比
  history3y: YearPoint[];      // 组最低分历史
  historyFiling3y: YearPoint[]; // 组投档线历史
  prediction2026: RankPrediction; // 2026 预测
  metrics: {
    planCount: number;
    planDelta: number;
    postgradRate: string;       // 校级保研率
    furtherStudyRate: string;   // 升学率（含出国）
    employmentRate: string;     // 就业率
    abroadRate?: string;        // 出国率（可选）
    tuition: string;
    duration: string;
    satisfaction: number;       // 满意度 0-5
    satisfactionSample: number; // 样本量
    avgSalary: string;          // 平均月薪（毕业 5 年）
  };
  majorStat: { recommended: number; backup: number; risk: number; total: number };
  topMajors: PreviewMajor[];
  similarStudents?: {
    sampleCount: number;
    admittedCount: number;
    topMajors: { name: string; count: number }[];
    failures: { reason: string; count: number }[];
  };
  warnings: Array<{
    level: 'info' | 'warn' | 'danger';
    icon: React.ReactNode;
    content: React.ReactNode;
  }>;
}

// ============ 梯度顺序 / 颜色 ============
const GRADE_ORDER = ['极冲', '冲', '稳', '稳保', '保', '兜底'] as const;
type GradeKey = typeof GRADE_ORDER[number];

const GRADE_TONE: Record<GradeKey, 'rush' | 'rushSoft' | 'stable' | 'stableSoft' | 'safe' | 'safeSoft'> = {
  极冲: 'rush',
  冲: 'rushSoft',
  稳: 'stable',
  稳保: 'stableSoft',
  保: 'safe',
  兜底: 'safeSoft',
};

// ============ Mock：学生上下文（用于位次差/偏好对比） ============
const STUDENT_CONTEXT = {
  name: '张同学',
  totalScore: 625,
  rank: 11340,                           // 兼容旧字段
  storedRank: 11340,                     // 档案位次
  sortRank: 11340,                       // 排序位次（候选池计算口径）
  intakeStatus: 'VERIFIED' as const,
  intakeStatusLabel: '资料已确认',
  subjects: '物理 + 化学',
  subjectCombination: '物理 / 化学 / 生物',
  examSource: '正式高考',
  // 单科成绩
  scoreChinese: 124,
  scoreMath: 138,
  scoreEnglish: 132,
  scoreFirstChoice: 88,
  scoreSub1: 76,
  scoreSub2: 67,
  // 优势 / 短板（chip 化）
  strengths: ['数学 138/150', '英语 132/150'],
  weaknesses: ['物理 88/100', '生物 67/100'],
  // 意向
  priorityMode: '专业优先',
  stayPreference: '倾向本省',
  careerPlan: '考研深造',
  careerDirection: '计算机 / AI 方向',
  preferredCities: ['成都', '杭州', '武汉'],
  preferredUniversities: ['四川大学', '电子科技大学'],
  preferredMajors: ['计算机科学与技术', '软件工程', '人工智能'],
  preferredBatches: ['本科一批', '本科批'],
  // 排除与红线
  excludedProvinces: [] as string[],
  excludedUniversities: [] as string[],
  excludedMajors: ['采矿工程', '殡葬专业'],
  riskPreferences: ['接受中外合办', '不接受民办'],
  physicalLimits: [] as string[],
  otherRequirements: '希望保研率高，能考研',
};

// Mock：已有方案（截图 1 显示的 "本科批B段·V1·DRAFT"）
const EXISTING_PLANS = [
  { id: 1, batchName: '本科批B段', versionNo: 1, status: 'DRAFT', active: true },
];

// Mock：已选专业组（从候选池加入的志愿项）
const SELECTED_PLAN_ITEMS = [
  {
    id: 1,
    order: 1,
    universityName: '四川大学',
    groupCode: '02 组',
    groupName: '计算机类',
    majors: ['软件工程', '计算机科学与技术'],
    rank: 11200,
    gradient: '稳' as GradeKey,
    riskLevel: 'normal' as const,
  },
  {
    id: 2,
    order: 2,
    universityName: '中南财经政法大学',
    groupCode: '06 组',
    groupName: '经济学类',
    majors: ['金融学', '会计学'],
    rank: 14800,
    gradient: '稳保' as GradeKey,
    riskLevel: 'normal' as const,
  },
  {
    id: 3,
    order: 3,
    universityName: '西南交通大学',
    groupCode: '05 组',
    groupName: '交通运输类',
    majors: ['交通运输', '车辆工程', '土木工程'],
    rank: 25800,
    gradient: '保' as GradeKey,
    riskLevel: 'normal' as const,
  },
];

// Mock：方案健康度
const PLAN_HEALTH = {
  selectedCount: SELECTED_PLAN_ITEMS.length,
  riskCount: SELECTED_PLAN_ITEMS.filter((i) => i.riskLevel !== 'normal').length,
  status: 'DRAFT',
  gradientDist: {
    rush: 0,      // 冲（极冲+冲+小冲）
    stable: 2,    // 稳（稳+稳保）
    safe: 1,      // 保（保+兜底）
  },
  recommend: {
    rush: { min: 4, max: 8 },
    stable: { min: 6, max: 10 },
    safe: { min: 4, max: 8 },
  },
};

// Mock：批次选择项
const BATCH_OPTIONS = [
  { value: 'b-batch', label: '本科批B段（45 组）· 已有V1', current: true },
  { value: 'a-batch', label: '本科批A段（60 组）· 未创建' },
  { value: 'special', label: '强基 / 综合评价（待开放）' },
];

// ============ Mock 数据 ============
const SAMPLE_CARDS: PreviewCard[] = [
  // 卡 1：稳 —— 四川大学
  {
    universityName: '四川大学',
    shortName: '四川',
    tiers: ['985', '211', 'DFC'],
    softRank: 28,
    city: '成都市',
    district: '武侯区·望江主校区',
    groupName: '计算机类',
    groupCode: '02 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'stable',
    gradeLabel: '稳',
    rankDelta: '高 6%',
    rankGapAbs: 694,
    matchScore: 87,
    matchReason: '本省 985·考研方向匹配·位次安全',
    prefMatch: { province: 'match', tuition: 'within', career: 'strong', subjects: 'match' },
    history3y: [
      { year: 2023, score: 619, rank: 14200 },
      { year: 2024, score: 622, rank: 12800 },
      { year: 2025, score: 624, rank: 12034 },
    ],
    historyFiling3y: [
      { year: 2023, score: 624, rank: 13100 },
      { year: 2024, score: 627, rank: 11800 },
      { year: 2025, score: 629, rank: 11200 },
    ],
    prediction2026: { year: 2026, score: 626, rank: 11600, scoreLow: 622, scoreHigh: 630, confidence: 'high' },
    metrics: {
      planCount: 82,
      planDelta: 7,
      postgradRate: '18.5%',
      furtherStudyRate: '38.2%',
      employmentRate: '96.4%',
      abroadRate: '4.6%',
      tuition: '6000/年起',
      duration: '4 年',
      satisfaction: 4.6,
      satisfactionSample: 8420,
      avgSalary: '12.8k',
    },
    majorStat: { recommended: 4, backup: 5, risk: 3, total: 12 },
    similarStudents: {
      sampleCount: 18,
      admittedCount: 12,
      topMajors: [
        { name: '软件工程', count: 5 },
        { name: '计算机科学与技术', count: 4 },
        { name: '人工智能', count: 3 },
      ],
      failures: [
        { reason: '主动放弃服从调剂', count: 5 },
        { reason: '专业组投档被退档', count: 1 },
      ],
    },
    topMajors: [
      {
        name: '软件工程',
        code: '080902',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 24,
        trend: 'up',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 631, rank: 9800 },
          { year: 2024, score: 635, rank: 8200 },
          { year: 2025, score: 638, rank: 7600 },
        ],
        notes: '英语单科成绩 ≥ 110 分；本专业按大类招生，第二学年分流',
      },
      {
        name: '计算机科学与技术',
        code: '080901',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 18,
        trend: 'up',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 625, rank: 11200 },
          { year: 2024, score: 628, rank: 10500 },
          { year: 2025, score: 630, rank: 9800 },
        ],
      },
      {
        name: '人工智能',
        code: '080910T',
        ranking: 'B+',
        master: true,
        doctoral: false,
        planCount: 12,
        trend: 'up',
        section: 'RECOMMENDED',
        isNew: true,
        scores3y: [
          { year: 2023, score: 619, rank: 14200 },
          { year: 2024, score: 624, rank: 12100 },
          { year: 2025, score: 626, rank: 11400 },
        ],
      },
      {
        name: '网络工程',
        code: '080903',
        ranking: 'B',
        master: true,
        doctoral: false,
        planCount: 8,
        trend: 'flat',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 615, rank: 16000 },
          { year: 2024, score: 616, rank: 15800 },
          { year: 2025, score: 616, rank: 15500 },
        ],
        supplementary: [
          { year: 2025, rounds: [{ round: 1, count: 2, lineDrop: 4, date: '7-26' }] },
        ],
        notes: '色弱、色盲考生不录取',
      },
    ],
    warnings: [
      {
        level: 'warn',
        icon: <WarningOutlined />,
        content: (
          <>
            <b>招生备注</b>：色弱不录·英语单科 ≥ 110·男女比例不限
          </>
        ),
      },
    ],
  },

  // 卡 2：冲 —— 浙江大学
  {
    universityName: '浙江大学',
    shortName: '浙大',
    tiers: ['985', '211', 'DFC'],
    softRank: 6,
    city: '杭州市',
    district: '紫金港校区',
    groupName: '工科试验班(信息)',
    groupCode: '03 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'rush',
    gradeLabel: '冲',
    rankDelta: '低 18%',
    rankGapAbs: -10020,
    matchScore: 72,
    matchReason: '顶级 985 但位次冲刺较大·外省',
    prefMatch: { province: 'mismatch', tuition: 'within', career: 'strong', subjects: 'match' },
    history3y: [
      { year: 2023, score: 652, rank: 1800 },
      { year: 2024, score: 656, rank: 1450 },
      { year: 2025, score: 658, rank: 1320 },
    ],
    historyFiling3y: [
      { year: 2023, score: 656, rank: 1620 },
      { year: 2024, score: 660, rank: 1280 },
      { year: 2025, score: 662, rank: 1180 },
    ],
    prediction2026: { year: 2026, score: 660, rank: 1240, scoreLow: 657, scoreHigh: 663, confidence: 'high' },
    metrics: {
      planCount: 28,
      planDelta: -4,
      postgradRate: '32.0%',
      furtherStudyRate: '58.5%',
      employmentRate: '97.8%',
      abroadRate: '12.4%',
      tuition: '5300/年起',
      duration: '4 年',
      satisfaction: 4.8,
      satisfactionSample: 12300,
      avgSalary: '18.2k',
    },
    majorStat: { recommended: 2, backup: 4, risk: 2, total: 8 },
    similarStudents: {
      sampleCount: 24,
      admittedCount: 3,
      topMajors: [
        { name: '计算机科学与技术', count: 2 },
        { name: '人工智能', count: 1 },
      ],
      failures: [
        { reason: '位次差距过大，未达投档线', count: 21 },
      ],
    },
    topMajors: [
      {
        name: '计算机科学与技术',
        code: '080901',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 10,
        trend: 'up',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 662, rank: 980 },
          { year: 2024, score: 666, rank: 720 },
          { year: 2025, score: 668, rank: 650 },
        ],
        notes: '英语单科成绩 ≥ 120 分；非色盲色弱；建议高考数学 ≥ 130 分',
      },
      {
        name: '人工智能',
        code: '080910T',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 6,
        trend: 'up',
        section: 'RECOMMENDED',
        isNew: true,
        scores3y: [
          { year: 2023, score: 658, rank: 1280 },
          { year: 2024, score: 662, rank: 990 },
          { year: 2025, score: 664, rank: 880 },
        ],
        notes: '色盲、色弱不录取',
      },
      {
        name: '信息安全',
        code: '080904K',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 6,
        trend: 'flat',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 655, rank: 1550 },
          { year: 2024, score: 656, rank: 1450 },
          { year: 2025, score: 656, rank: 1430 },
        ],
        notes: '需通过政审；女生录取比例不超过 15%；要求英语 ≥ 110',
      },
      {
        name: '软件工程（中外合办）',
        code: '080902H',
        ranking: 'A',
        master: true,
        doctoral: false,
        planCount: 6,
        trend: 'up',
        section: 'BACKUP',
        isSino: true,
        scores3y: [
          { year: 2023, score: 645, rank: 2800 },
          { year: 2024, score: 648, rank: 2350 },
          { year: 2025, score: 650, rank: 2100 },
        ],
        supplementary: [
          { year: 2024, rounds: [{ round: 1, count: 3, lineDrop: 8, date: '7-25' }] },
          { year: 2025, rounds: [
            { round: 1, count: 5, lineDrop: 12, date: '7-25' },
            { round: 2, count: 3, lineDrop: 6, date: '7-28' },
          ] },
        ],
        notes: '学费 90000 元/年；需赴新加坡国立大学交流 1 学年；英语 ≥ 130',
      },
    ],
    warnings: [
      {
        level: 'danger',
        icon: <ExclamationCircleOutlined />,
        content: (
          <>
            <b>位次缺口大</b>：学生位次 1,560 比组最低高出 240（约 18%），命中概率低于 35%，建议作为冲刺位
          </>
        ),
      },
      {
        level: 'warn',
        icon: <WarningOutlined />,
        content: (
          <>
            <b>缩招警示</b>：2026 年招生计划较 2025 年减少 4 人（-12.5%），分数线可能上行
          </>
        ),
      },
    ],
  },

  // 卡 3：保 —— 西南交通大学
  {
    universityName: '西南交通大学',
    shortName: '西交',
    tiers: ['211', 'DFC'],
    softRank: 59,
    city: '成都市',
    district: '犀浦校区',
    groupName: '交通运输类',
    groupCode: '05 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'safe',
    gradeLabel: '保',
    rankDelta: '低 22%',
    rankGapAbs: 15860,
    matchScore: 76,
    matchReason: '本省 211·位次远高于组最低，发挥空间被压缩',
    prefMatch: { province: 'match', tuition: 'within', career: 'strong', subjects: 'match' },
    history3y: [
      { year: 2023, score: 598, rank: 23500 },
      { year: 2024, score: 595, rank: 25800 },
      { year: 2025, score: 592, rank: 27200 },
    ],
    historyFiling3y: [
      { year: 2023, score: 602, rank: 22100 },
      { year: 2024, score: 599, rank: 24300 },
      { year: 2025, score: 596, rank: 25800 },
    ],
    prediction2026: { year: 2026, score: 590, rank: 28500, scoreLow: 586, scoreHigh: 595, confidence: 'medium' },
    metrics: {
      planCount: 156,
      planDelta: 12,
      postgradRate: '23.8%',
      furtherStudyRate: '42.6%',
      employmentRate: '95.7%',
      abroadRate: '2.8%',
      tuition: '4900/年起',
      duration: '4 年',
      satisfaction: 4.4,
      satisfactionSample: 6850,
      avgSalary: '10.5k',
    },
    majorStat: { recommended: 6, backup: 6, risk: 3, total: 15 },
    similarStudents: {
      sampleCount: 32,
      admittedCount: 28,
      topMajors: [
        { name: '交通运输', count: 8 },
        { name: '车辆工程', count: 6 },
        { name: '土木工程', count: 4 },
      ],
      failures: [
        { reason: '主动放弃（去了其他保校）', count: 4 },
      ],
    },
    topMajors: [
      {
        name: '交通运输',
        code: '081801',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 32,
        trend: 'down',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 608, rank: 19200 },
          { year: 2024, score: 605, rank: 21500 },
          { year: 2025, score: 600, rank: 24800 },
        ],
        notes: '色觉异常不录；身高要求男生 ≥ 170cm，女生 ≥ 165cm；视力裸眼 ≥ 4.8',
      },
      {
        name: '车辆工程',
        code: '080207',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 28,
        trend: 'down',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 605, rank: 20100 },
          { year: 2024, score: 602, rank: 22500 },
          { year: 2025, score: 598, rank: 24900 },
        ],
      },
      {
        name: '土木工程',
        code: '081001',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 36,
        trend: 'down',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 595, rank: 24800 },
          { year: 2024, score: 590, rank: 27500 },
          { year: 2025, score: 585, rank: 30200 },
        ],
        supplementary: [
          { year: 2023, rounds: [{ round: 1, count: 4, lineDrop: 6, date: '7-26' }] },
          { year: 2024, rounds: [{ round: 1, count: 6, lineDrop: 10, date: '7-25' }] },
          { year: 2025, rounds: [
            { round: 1, count: 8, lineDrop: 14, date: '7-25' },
            { round: 2, count: 4, lineDrop: 8, date: '7-28' },
          ] },
        ],
        notes: '建议男生报考，工地实习较多；不招收单科外语小语种考生',
      },
      {
        name: '智能制造工程',
        code: '080213T',
        ranking: 'B+',
        master: false,
        doctoral: false,
        planCount: 22,
        trend: 'flat',
        section: 'BACKUP',
        isNew: true,
        scores3y: [
          { year: 2023, score: 590, rank: 28100 },
          { year: 2024, score: 588, rank: 29300 },
          { year: 2025, score: 588, rank: 29500 },
        ],
        supplementary: [
          { year: 2025, rounds: [{ round: 1, count: 3, lineDrop: 5, date: '7-26' }] },
        ],
        notes: '2024 年新增专业，首届招生；培养方案以入学手册为准',
      },
    ],
    warnings: [
      {
        level: 'info',
        icon: <InfoCircleOutlined />,
        content: (
          <>
            <b>征集信号</b>：2025 年该院校批次征集 1 轮共 8 人，投档线降 9 分。该专业组为本科一批扩招趋势
          </>
        ),
      },
    ],
  },

  // 卡 4：极冲 —— 复旦大学
  {
    universityName: '复旦大学',
    shortName: '复旦',
    tiers: ['985', '211', 'DFC'],
    softRank: 16,
    city: '上海市',
    district: '杨浦区·邯郸校区',
    groupName: '工科试验班(智能)',
    groupCode: '04 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'rush',
    gradeLabel: '极冲',
    rankDelta: '低 32%',
    rankGapAbs: -10440,
    matchScore: 64,
    matchReason: '顶尖 985 但位次差距过大·外省·命中概率 <25%',
    prefMatch: { province: 'mismatch', tuition: 'within', career: 'strong', subjects: 'match' },
    history3y: [
      { year: 2023, score: 658, rank: 950 },
      { year: 2024, score: 661, rank: 820 },
      { year: 2025, score: 663, rank: 720 },
    ],
    historyFiling3y: [
      { year: 2023, score: 662, rank: 820 },
      { year: 2024, score: 665, rank: 680 },
      { year: 2025, score: 666, rank: 620 },
    ],
    prediction2026: { year: 2026, score: 668, rank: 580, scoreLow: 665, scoreHigh: 671, confidence: 'high' },
    metrics: {
      planCount: 18,
      planDelta: -2,
      postgradRate: '36.0%',
      furtherStudyRate: '64.2%',
      employmentRate: '98.5%',
      abroadRate: '15.8%',
      tuition: '5800/年起',
      duration: '4 年',
      satisfaction: 4.9,
      satisfactionSample: 14600,
      avgSalary: '21.5k',
    },
    majorStat: { recommended: 1, backup: 3, risk: 2, total: 6 },
    similarStudents: {
      sampleCount: 32,
      admittedCount: 1,
      topMajors: [
        { name: '计算机科学（拔尖班）', count: 1 },
      ],
      failures: [
        { reason: '位次差距悬殊（领先 10,000+ 名才能录取）', count: 31 },
      ],
    },
    topMajors: [
      {
        name: '计算机科学（拔尖班）',
        code: '080901T',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 6,
        trend: 'up',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 668, rank: 480 },
          { year: 2024, score: 671, rank: 380 },
          { year: 2025, score: 673, rank: 320 },
        ],
        notes: '英语单科 ≥ 130；面试入学；色盲色弱不录',
      },
      {
        name: '人工智能',
        code: '080910T',
        ranking: 'A+',
        master: true,
        doctoral: true,
        planCount: 6,
        trend: 'up',
        section: 'RECOMMENDED',
        isNew: true,
        scores3y: [
          { year: 2023, score: 662, rank: 780 },
          { year: 2024, score: 665, rank: 640 },
          { year: 2025, score: 667, rank: 550 },
        ],
      },
      {
        name: '智能科学与技术',
        code: '080907T',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 6,
        trend: 'flat',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 660, rank: 880 },
          { year: 2024, score: 661, rank: 850 },
          { year: 2025, score: 662, rank: 800 },
        ],
      },
    ],
    warnings: [
      {
        level: 'danger',
        icon: <ExclamationCircleOutlined />,
        content: (
          <>
            <b>命中概率极低</b>：学生位次 11,340 比组最低 720 落后超 10,000 名，仅作为冲刺位
          </>
        ),
      },
    ],
  },

  // 卡 5：稳保 —— 中南财经政法大学
  {
    universityName: '中南财经政法大学',
    shortName: '中财',
    tiers: ['211', 'DFC'],
    softRank: 78,
    city: '武汉市',
    district: '洪山区·首义校区',
    groupName: '经济学类',
    groupCode: '06 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'stable',
    gradeLabel: '稳保',
    rankDelta: '高 12%',
    rankGapAbs: 4660,
    matchScore: 79,
    matchReason: '财经 211·位次安全·但外省 + 偏离工科方向',
    prefMatch: { province: 'mismatch', tuition: 'within', career: 'weak', subjects: 'match' },
    history3y: [
      { year: 2023, score: 605, rank: 19800 },
      { year: 2024, score: 608, rank: 18200 },
      { year: 2025, score: 610, rank: 16000 },
    ],
    historyFiling3y: [
      { year: 2023, score: 609, rank: 18200 },
      { year: 2024, score: 612, rank: 16500 },
      { year: 2025, score: 614, rank: 14800 },
    ],
    prediction2026: { year: 2026, score: 612, rank: 15400, scoreLow: 608, scoreHigh: 616, confidence: 'medium' },
    metrics: {
      planCount: 64,
      planDelta: 2,
      postgradRate: '14.2%',
      furtherStudyRate: '28.6%',
      employmentRate: '94.8%',
      abroadRate: '4.2%',
      tuition: '5500/年起',
      duration: '4 年',
      satisfaction: 4.3,
      satisfactionSample: 5240,
      avgSalary: '11.2k',
    },
    majorStat: { recommended: 3, backup: 5, risk: 2, total: 10 },
    similarStudents: {
      sampleCount: 14,
      admittedCount: 11,
      topMajors: [
        { name: '金融学', count: 4 },
        { name: '会计学', count: 3 },
        { name: '法学', count: 2 },
      ],
      failures: [
        { reason: '主动放弃外省院校', count: 3 },
      ],
    },
    topMajors: [
      {
        name: '金融学',
        code: '020301',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 14,
        trend: 'up',
        section: 'RECOMMENDED',
        isNational: true,
        scores3y: [
          { year: 2023, score: 615, rank: 15800 },
          { year: 2024, score: 618, rank: 14200 },
          { year: 2025, score: 620, rank: 12800 },
        ],
      },
      {
        name: '会计学',
        code: '120203K',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 18,
        trend: 'up',
        section: 'RECOMMENDED',
        scores3y: [
          { year: 2023, score: 612, rank: 17200 },
          { year: 2024, score: 614, rank: 16000 },
          { year: 2025, score: 616, rank: 14500 },
        ],
      },
      {
        name: '法学',
        code: '030101K',
        ranking: 'A',
        master: true,
        doctoral: true,
        planCount: 12,
        trend: 'flat',
        section: 'BACKUP',
        isNational: true,
        scores3y: [
          { year: 2023, score: 608, rank: 19200 },
          { year: 2024, score: 609, rank: 18500 },
          { year: 2025, score: 610, rank: 17800 },
        ],
      },
    ],
    warnings: [],
  },

  // 卡 6：兜底 —— 四川师范大学
  {
    universityName: '四川师范大学',
    shortName: '川师',
    tiers: [],
    softRank: 215,
    city: '成都市',
    district: '锦江区·狮子山校区',
    groupName: '电子信息类',
    groupCode: '07 组',
    subjects: '物理 + 化学',
    runningNature: '公办',
    gradient: 'safe',
    gradeLabel: '兜底',
    rankDelta: '高 38%',
    rankGapAbs: 28660,
    matchScore: 68,
    matchReason: '本省·位次远高于组最低·适合兜底但浪费分数',
    prefMatch: { province: 'match', tuition: 'within', career: 'weak', subjects: 'match' },
    history3y: [
      { year: 2023, score: 548, rank: 48500 },
      { year: 2024, score: 552, rank: 42800 },
      { year: 2025, score: 550, rank: 40000 },
    ],
    historyFiling3y: [
      { year: 2023, score: 552, rank: 45200 },
      { year: 2024, score: 556, rank: 40500 },
      { year: 2025, score: 554, rank: 38600 },
    ],
    prediction2026: { year: 2026, score: 552, rank: 41000, scoreLow: 548, scoreHigh: 556, confidence: 'low' },
    metrics: {
      planCount: 240,
      planDelta: 18,
      postgradRate: '6.8%',
      furtherStudyRate: '15.4%',
      employmentRate: '92.5%',
      abroadRate: '1.2%',
      tuition: '4500/年起',
      duration: '4 年',
      satisfaction: 4.0,
      satisfactionSample: 3120,
      avgSalary: '7.8k',
    },
    majorStat: { recommended: 4, backup: 8, risk: 4, total: 16 },
    similarStudents: {
      sampleCount: 28,
      admittedCount: 26,
      topMajors: [
        { name: '电子信息工程', count: 8 },
        { name: '通信工程', count: 6 },
        { name: '计算机科学（师范）', count: 4 },
      ],
      failures: [
        { reason: '位次太高未选择此校', count: 2 },
      ],
    },
    topMajors: [
      {
        name: '电子信息工程',
        code: '080701',
        ranking: 'B+',
        master: true,
        doctoral: false,
        planCount: 50,
        trend: 'flat',
        section: 'RECOMMENDED',
        scores3y: [
          { year: 2023, score: 555, rank: 45200 },
          { year: 2024, score: 558, rank: 41500 },
          { year: 2025, score: 556, rank: 39800 },
        ],
        notes: '本专业实行大类招生，第二学年分流',
      },
      {
        name: '通信工程',
        code: '080703',
        ranking: 'B',
        master: true,
        doctoral: false,
        planCount: 40,
        trend: 'flat',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 552, rank: 48000 },
          { year: 2024, score: 553, rank: 46500 },
          { year: 2025, score: 552, rank: 45000 },
        ],
      },
      {
        name: '计算机科学与技术(师范)',
        code: '080901S',
        ranking: 'B',
        master: false,
        doctoral: false,
        planCount: 35,
        trend: 'flat',
        section: 'BACKUP',
        scores3y: [
          { year: 2023, score: 548, rank: 50500 },
          { year: 2024, score: 550, rank: 49000 },
          { year: 2025, score: 549, rank: 48000 },
        ],
        notes: '师范类，毕业生主要从事中小学教学；签订师范协议',
      },
    ],
    warnings: [
      {
        level: 'info',
        icon: <InfoCircleOutlined />,
        content: (
          <>
            <b>分数压缩明显</b>：学生位次远高于组最低（领先 28,660 名），考虑是否值得用学位换稳妥
          </>
        ),
      },
    ],
  },
];

// ============ 子组件：3 年趋势 SVG ============
function TrendChart({
  points,
  prediction,
}: {
  points: YearPoint[];
  prediction?: RankPrediction;
}) {
  const W = 240;
  const H = 46;
  const PAD_X = 12;
  const PAD_Y = 10;

  // 把预测点也纳入坐标计算（让 Y 轴合理压缩）
  const allScores = [...points.map((p) => p.score)];
  if (prediction) allScores.push(prediction.score, prediction.scoreLow, prediction.scoreHigh);
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);
  const span = maxScore - minScore || 1;

  const totalPts = points.length + (prediction ? 1 : 0);
  const stepX = (W - PAD_X * 2) / (totalPts - 1);
  const yOf = (s: number) => H - PAD_Y - ((s - minScore) / span) * (H - PAD_Y * 2 - 2);
  const xOf = (i: number) => PAD_X + i * stepX;

  const historicalPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.score)}`)
    .join(' ');
  const lastHist = points[points.length - 1];
  const predX = xOf(points.length);
  const predY = prediction ? yOf(prediction.score) : 0;
  const dashedPath = prediction
    ? `M ${xOf(points.length - 1)} ${yOf(lastHist.score)} L ${predX} ${predY}`
    : '';
  const areaPath = `${historicalPath} L ${xOf(points.length - 1)} ${H - PAD_Y} L ${xOf(0)} ${H - PAD_Y} Z`;

  // 置信带（垂直误差条）
  const predBandTop = prediction ? yOf(prediction.scoreHigh) : 0;
  const predBandBottom = prediction ? yOf(prediction.scoreLow) : 0;

  return (
    <svg className={styles.trendSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
      <defs>
        <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c5282" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2c5282" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trend-grad)" />
      <path d={historicalPath} fill="none" stroke="#1e3a5f" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

      {prediction ? (
        <>
          {/* 置信带（误差区间） */}
          <rect
            x={predX - 5}
            y={predBandTop}
            width="10"
            height={predBandBottom - predBandTop}
            fill="#b8860b"
            opacity="0.18"
            rx="2"
          />
          {/* 预测连接虚线 */}
          <path d={dashedPath} fill="none" stroke="#b8860b" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" />
        </>
      ) : null}

      {/* 历史点 */}
      {points.map((p, i) => (
        <g key={p.year}>
          <circle cx={xOf(i)} cy={yOf(p.score)} r="2.8" fill="#fff" stroke="#1e3a5f" strokeWidth="1.6" />
          <text
            x={xOf(i)}
            y={yOf(p.score) - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#1a1a19"
            fontWeight="700"
          >
            {p.score}
          </text>
          <text
            x={xOf(i)}
            y={H - 1}
            textAnchor="middle"
            fontSize="8"
            fill="#87867f"
          >
            '{String(p.year).slice(-2)}
          </text>
        </g>
      ))}

      {/* 预测点（菱形空心 + 标注） */}
      {prediction ? (
        <g>
          <rect
            x={predX - 3}
            y={predY - 3}
            width="6"
            height="6"
            fill="#fff"
            stroke="#b8860b"
            strokeWidth="1.6"
            transform={`rotate(45 ${predX} ${predY})`}
          />
          <text
            x={predX}
            y={predY - 5}
            textAnchor="middle"
            fontSize="9"
            fill="#8a6510"
            fontWeight="700"
          >
            {prediction.score}
          </text>
          <text x={predX} y={H - 1} textAnchor="middle" fontSize="8" fill="#b8860b" fontWeight="600">
            '{String(prediction.year).slice(-2)}预
          </text>
        </g>
      ) : null}
    </svg>
  );
}

// MatchHeader / PrefChip 已抽到 @/components/candidate-pool-v2/

// ============ 子组件：同分相近录取 banner ============
function SimilarStudentsBar({ data }: { data?: PreviewCard['similarStudents'] }) {
  if (!data) return null;
  const rate = (data.admittedCount / data.sampleCount) * 100;
  const tone = rate >= 60 ? 'high' : rate >= 20 ? 'mid' : 'low';
  const toneClass =
    tone === 'high' ? styles.similarToneHigh :
    tone === 'mid' ? styles.similarToneMid :
    styles.similarToneLow;

  return (
    <div className={`${styles.similarBar} ${toneClass}`}>
      <div className={styles.similarHead}>
        <span className={styles.similarIcon}>📚</span>
        <span className={styles.similarTitle}>
          <b>同分参考</b>
          <span className={styles.similarSub}>与张同学分数相近（625 ± 3）的 2025 届 {data.sampleCount} 位考生</span>
        </span>
      </div>
      <div className={styles.similarStats}>
        <div className={styles.similarRateBox}>
          <div className={styles.similarRateValue}>
            <b>{data.admittedCount}</b>
            <span className={styles.similarRateSep}>/</span>
            <span className={styles.similarRateTotal}>{data.sampleCount}</span>
          </div>
          <div className={styles.similarRateBar}>
            <div
              className={styles.similarRateBarFill}
              style={{ width: `${rate}%` }}
            />
          </div>
          <div className={styles.similarRateLabel}>
            录取率 <b>{rate.toFixed(1)}%</b>
          </div>
        </div>
        <div className={styles.similarDetails}>
          {data.topMajors.length > 0 ? (
            <div className={styles.similarRow}>
              <span className={`${styles.similarRowLabel} ${styles.similarLabelGood}`}>✓ 录取去向</span>
              <span className={styles.similarRowContent}>
                {data.topMajors.map((m, i) => (
                  <span key={m.name}>
                    {i > 0 && <span className={styles.similarSep}>·</span>}
                    {m.name} <b>{m.count}</b>
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {data.failures.length > 0 ? (
            <div className={styles.similarRow}>
              <span className={`${styles.similarRowLabel} ${styles.similarLabelBad}`}>✗ 未录原因</span>
              <span className={styles.similarRowContent}>
                {data.failures.map((f, i) => (
                  <span key={f.reason}>
                    {i > 0 && <span className={styles.similarSep}>·</span>}
                    {f.reason} <b>{f.count}</b>
                  </span>
                ))}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============ 子组件：满意度星星 ============
function SatisStars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={styles.satisStars} aria-label={`${value.toFixed(1)} 分`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={
          i < full ? styles.satisStarFull :
          i === full && half ? styles.satisStarHalf :
          styles.satisStarEmpty
        }>★</span>
      ))}
    </span>
  );
}

// ============ 子组件：档次徽章 ============
function TierBadges({ tiers }: { tiers: PreviewCard['tiers'] }) {
  return (
    <span className={styles.tierBadges}>
      {tiers.includes('985') && <span className={styles.tier985}>985</span>}
      {tiers.includes('211') && <span className={styles.tier211}>211</span>}
      {tiers.includes('DFC') && <span className={styles.tierDFC}>双一流</span>}
      {tiers.includes('PROVINCIAL') && <span className={styles.tierProvincial}>省重点</span>}
      {tiers.includes('BENZHONG') && <span className={styles.tierBenZhong}>本科</span>}
    </span>
  );
}

// ============ 子组件：专业行 ============
// 征集 chip 等级判断
function suppLevel(years: SupplementaryYear[]): 'low' | 'med' | 'high' {
  const yearCount = years.length;
  const latest = years[years.length - 1];
  const latestRounds = latest?.rounds.length ?? 0;
  if (yearCount >= 3) return 'high';
  if (yearCount >= 2 || latestRounds >= 2) return 'med';
  return 'low';
}

// 征集 chip：最近一年的主信息 + Tooltip 看完整明细
function SuppChip({ data }: { data?: SupplementaryYear[] }) {
  if (!data || data.length === 0) {
    return <span className={styles.suppNone}>—</span>;
  }

  const latest = data[data.length - 1];
  const latestTotal = latest.rounds.reduce((s, r) => s + r.count, 0);
  const yearShort = String(latest.year).slice(-2);
  const roundsDist = latest.rounds.map((r) => r.count).join('+');
  const level = suppLevel(data);
  const levelClass =
    level === 'high' ? styles.suppHigh :
    level === 'med' ? styles.suppMed :
    styles.suppLow;

  const tooltipContent = (
    <div className={styles.suppTooltip}>
      <div className={styles.suppTooltipTitle}>
        <SoundOutlined /> 历年征集明细
      </div>
      {data.map((y) => (
        <div key={y.year} className={styles.suppTooltipYear}>
          <div className={styles.suppTooltipYearHead}>
            <b>{y.year} 年</b> · 共 {y.rounds.reduce((s, r) => s + r.count, 0)} 人 · {y.rounds.length} 轮
          </div>
          {y.rounds.map((r) => (
            <div key={r.round} className={styles.suppTooltipRound}>
              第 {r.round} 轮{r.date ? `（${r.date}）` : ''}：
              招 <b>{r.count}</b> 人
              {typeof r.lineDrop === 'number' ? ` · 投档线降 ${r.lineDrop} 分` : ''}
            </div>
          ))}
        </div>
      ))}
      {data.length >= 3 ? (
        <div className={styles.suppTooltipWarn}>
          ⚠ 连续 {data.length} 年征集，提示该专业持续招不满，需谨慎评估
        </div>
      ) : null}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" styles={{ root: { maxWidth: 340 } }}>
      <span className={`${styles.suppChip} ${levelClass}`}>
        <SoundOutlined className={styles.suppIcon} />
        <span className={styles.suppMain}>
          {yearShort} 年 · {latest.rounds.length} 轮
        </span>
        <span className={styles.suppDist}>
          {roundsDist} 人{latestTotal !== latest.rounds[0].count ? '' : ''}
        </span>
        {data.length >= 3 ? <span className={styles.suppMultiYear}>{data.length}年</span> : null}
      </span>
    </Tooltip>
  );
}

// classifyNotes / NotesChip 已抽到 @/components/candidate-pool-v2/

function MajorRow({ major }: { major: PreviewMajor }) {
  const [added, setAdded] = useState(false);
  const rankingClass =
    major.ranking === 'A+' ? styles.majorRankingAplus :
    major.ranking === 'A' ? styles.majorRankingA :
    major.ranking === 'B+' ? styles.majorRankingBplus :
    major.ranking === 'B' ? styles.majorRankingB :
    styles.majorRankingC;

  const sectionClass =
    major.section === 'RECOMMENDED' ? styles.majorSectionRec :
    major.section === 'RISK' ? styles.majorSectionRisk :
    styles.majorSectionBak;
  const sectionLabel =
    major.section === 'RECOMMENDED' ? '推荐' :
    major.section === 'RISK' ? '风险' :
    '备选';

  const starClass =
    major.section === 'RECOMMENDED' ? styles.majorStarRec :
    major.section === 'RISK' ? styles.majorStarRisk :
    styles.majorStarBak;

  // 计算专业级最低分/位次（取末尾年份）+ 1 年涨跌
  const latest = major.scores3y[major.scores3y.length - 1];
  const prev = major.scores3y[major.scores3y.length - 2];
  const scoreDelta = latest && prev ? latest.score - prev.score : 0;
  const rankDelta = latest && prev ? latest.rank - prev.rank : 0;
  const deltaScoreClass =
    scoreDelta > 0 ? styles.majorDeltaUp :
    scoreDelta < 0 ? styles.majorDeltaDown :
    styles.majorDeltaFlat;
  const deltaRankClass =
    rankDelta < 0 ? styles.majorDeltaUp :
    rankDelta > 0 ? styles.majorDeltaDown :
    styles.majorDeltaFlat;

  return (
    <div className={`${styles.majorRow} ${major.section === 'RISK' ? styles.dimmed : ''}`}>
      <div className={`${styles.majorStar} ${starClass}`}>
        <StarFilled />
      </div>
      <div className={styles.majorName}>
        <b>{major.name}</b>
        <span className={`${styles.majorRanking} ${rankingClass}`}>{major.ranking}</span>
        {major.isNew && <span className={`${styles.majorTag} ${styles.majorTagNew}`}>新</span>}
        {major.isSino && <span className={`${styles.majorTag} ${styles.majorTagSino}`}>中外</span>}
        {major.isNational && <span className={`${styles.majorTag} ${styles.majorTagNational}`}>国家特色</span>}
        <NotesChip notes={major.notes} />
      </div>
      <div className={styles.majorScoreCell}>
        <div className={styles.scoreMain}>
          <span className={styles.scoreMainValue}>{latest.score}</span>
          <span className={`${styles.scoreDelta} ${deltaScoreClass}`}>
            {scoreDelta > 0 ? '+' : ''}{scoreDelta}
          </span>
        </div>
        <div className={styles.scoreSub}>
          位次 {latest.rank.toLocaleString()}
          <span className={`${styles.rankDelta} ${deltaRankClass}`}>
            {rankDelta > 0 ? '+' : ''}{rankDelta >= 1000 || rankDelta <= -1000 ? `${Math.round(rankDelta/100)/10}k` : rankDelta}
          </span>
        </div>
      </div>
      <div className={styles.degree}>
        <span className={major.master ? styles.has : ''}>硕</span>
        <span className={major.doctoral ? styles.has : ''}>博</span>
      </div>
      <SuppChip data={major.supplementary} />
      <div className={styles.majorPlan}>
        本专业 <b>{major.planCount}</b> 人
      </div>
      <div className={styles.majorActions}>
        <span className={`${styles.majorSection} ${sectionClass}`}>{sectionLabel}</span>
        <button
          type="button"
          className={`${styles.majorAddBtn} ${added ? styles.majorAddBtnDone : ''}`}
          onClick={() => setAdded((v) => !v)}
          title={added ? '已加入志愿，点击撤销' : '直接加入此专业为志愿'}
        >
          {added ? <>✓ 已加入</> : <><PlusOutlined /> 加入</>}
        </button>
      </div>
    </div>
  );
}

// ============ 子组件：候选卡（折叠态） ============
function CandidateCard({
  card,
  expanded,
  onToggle,
  anchorId,
  compared,
  onCompareToggle,
  onHide,
}: {
  card: PreviewCard;
  expanded: boolean;
  onToggle: () => void;
  anchorId?: string;
  compared: boolean;
  onCompareToggle: () => void;
  onHide: () => void;
}) {
  const [trendType, setTrendType] = useState<'filing' | 'min'>('filing');
  const series = trendType === 'filing' ? card.historyFiling3y : card.history3y;
  const startScore = series[0].score;
  const endScore = series[series.length - 1].score;
  const scoreDelta = endScore - startScore;
  const startRank = series[0].rank;
  const endRank = series[series.length - 1].rank;
  const rankDelta = endRank - startRank;
  const pred = card.prediction2026;
  const predScoreDelta = pred.score - endScore;

  // 位次差表达（人话化）
  const studentRank = STUDENT_CONTEXT.rank;
  const groupEndRank = card.history3y[card.history3y.length - 1].rank;
  const gap = groupEndRank - studentRank;
  const gapText =
    gap > 0
      ? `学生领先 ${gap.toLocaleString()} 名`
      : gap < 0
        ? `学生落后 ${Math.abs(gap).toLocaleString()} 名`
        : '与组最低位次持平';

  const gradeBadgeClass =
    card.gradient === 'rush' ? styles.gradeBadgeRush :
    card.gradient === 'stable' ? styles.gradeBadgeStable :
    styles.gradeBadgeSafe;

  // 视觉权重：匹配度高 → primary（突出）；中 → standard；低 → secondary（紧凑）
  const weightClass =
    card.matchScore >= 85 ? styles.cardPrimary :
    card.matchScore >= 72 ? styles.cardStandard :
    styles.cardSecondary;

  return (
    <article id={anchorId} className={`${styles.card} ${weightClass} ${compared ? styles.cardCompared : ''}`}>
      {/* 匹配头条：matchScore + matchReason + 偏好对比 chip 组 */}
      <MatchHeader
        matchScore={card.matchScore}
        matchReason={card.matchReason}
        prefMatch={card.prefMatch}
        compared={compared}
        onCompareToggle={onCompareToggle}
      />

      {/* 顶部：学校档次行 + 操作 */}
      <header className={styles.cardHead}>
        <div className={styles.logo}>{card.shortName}</div>
        <div className={styles.headMain}>
          <div className={styles.titleRow}>
            <h3>{card.universityName}</h3>
            <TierBadges tiers={card.tiers} />
            <span className={styles.rank}>软科 <b>#{card.softRank}</b></span>
            <span className={styles.runningNature}>{card.runningNature}</span>
          </div>
          <div className={styles.metaRow}>
            <span><EnvironmentOutlined className={styles.metaIcon} />{card.city} · {card.district}</span>
            <span className={styles.metaSep}>·</span>
            <span><b>{card.groupName}</b>（{card.groupCode}）</span>
            <span className={styles.metaSep}>·</span>
            <span>选科：{card.subjects}</span>
          </div>
        </div>
        <div className={styles.headActions}>
          <div className={`${styles.gradeBadge} ${gradeBadgeClass}`}>
            <span className={styles.gradeLabel}>梯度</span>
            <span className={styles.gradeValue}>{card.gradeLabel}</span>
            <span className={styles.gradeNote}>{gapText}</span>
          </div>
          <div className={styles.actionStack}>
            <button className={styles.btn}>详情</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`}>
              <PlusOutlined /> 加入
            </button>
            <button
              className={`${styles.btn} ${styles.btnHide}`}
              onClick={onHide}
              title="不考虑此校（可恢复）"
            >
              <CloseOutlined /> 不考虑
            </button>
          </div>
        </div>
      </header>

      {/* 趋势条 —— 含切换、预测点、置信带 */}
      <div className={styles.trendRow}>
        <div className={styles.trendChartArea}>
          <div className={styles.trendHeader}>
            <span className={styles.trendLabel}>近 3 年 + 1 年预测</span>
            <div className={styles.trendToggle} role="tablist">
              <button
                className={`${styles.trendToggleBtn} ${trendType === 'filing' ? styles.trendToggleBtnActive : ''}`}
                onClick={() => setTrendType('filing')}
              >
                投档线
              </button>
              <button
                className={`${styles.trendToggleBtn} ${trendType === 'min' ? styles.trendToggleBtnActive : ''}`}
                onClick={() => setTrendType('min')}
              >
                组最低
              </button>
            </div>
          </div>
          <TrendChart points={series} prediction={pred} />
        </div>
        <div className={styles.trendStats}>
          <div className={styles.trendStat}>
            <span className={styles.trendStatLabel}>{trendType === 'filing' ? '2025 投档线' : '2025 组最低'}</span>
            <span className={styles.trendStatValue}>
              <b>{endScore}</b>
              <span className={`${styles.delta} ${scoreDelta > 0 ? styles.deltaUp : scoreDelta < 0 ? styles.deltaDown : styles.deltaFlat}`}>
                {scoreDelta > 0 ? <ArrowUpOutlined /> : scoreDelta < 0 ? <ArrowDownOutlined /> : null}
                {scoreDelta > 0 ? '+' : ''}{scoreDelta}
              </span>
            </span>
          </div>
          <div className={styles.trendStat}>
            <span className={styles.trendStatLabel}>2025 末位次</span>
            <span className={styles.trendStatValue}>
              <b>{endRank.toLocaleString()}</b>
              <span className={`${styles.delta} ${rankDelta < 0 ? styles.deltaUp : rankDelta > 0 ? styles.deltaDown : styles.deltaFlat}`}>
                {rankDelta < 0 ? <ArrowUpOutlined /> : rankDelta > 0 ? <ArrowDownOutlined /> : null}
                {rankDelta > 0 ? '+' : ''}{rankDelta.toLocaleString()}
              </span>
            </span>
          </div>
          <div className={`${styles.trendStat} ${styles.trendStatPred}`}>
            <span className={styles.trendStatLabel}>
              2026 预测
              <span className={`${styles.predConfidence} ${
                pred.confidence === 'high' ? styles.predHigh :
                pred.confidence === 'medium' ? styles.predMed :
                styles.predLow
              }`}>
                {pred.confidence === 'high' ? '高' : pred.confidence === 'medium' ? '中' : '低'}信心
              </span>
            </span>
            <span className={styles.trendStatValue}>
              <b>{pred.score}</b>
              <span className={styles.predRange}>±{Math.max(pred.score - pred.scoreLow, pred.scoreHigh - pred.score)}</span>
              <span className={`${styles.delta} ${predScoreDelta > 0 ? styles.deltaUp : predScoreDelta < 0 ? styles.deltaDown : styles.deltaFlat}`}>
                {predScoreDelta > 0 ? '+' : ''}{predScoreDelta}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 定量条 */}
      <div className={styles.metricStrip}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>本组招生</span>
          <span className={styles.metricValue}>
            {card.metrics.planCount}<small>人</small>
            <span className={`${styles.delta} ${card.metrics.planDelta > 0 ? styles.deltaDown : card.metrics.planDelta < 0 ? styles.deltaUp : styles.deltaFlat}`}>
              {card.metrics.planDelta > 0 ? '+' : ''}{card.metrics.planDelta}
            </span>
          </span>
          <span className={styles.metricSub}>
            {card.metrics.planDelta > 0 ? '较去年扩招' : card.metrics.planDelta < 0 ? '较去年缩招' : '与去年持平'}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>升学走向</span>
          <span className={styles.metricValue}>
            保研 {card.metrics.postgradRate}
          </span>
          <span className={styles.metricSub}>
            升学 {card.metrics.furtherStudyRate}
            {card.metrics.abroadRate ? <> · 出国 {card.metrics.abroadRate}</> : null}
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>学费 · 学制</span>
          <span className={styles.metricValue}>{card.metrics.tuition}</span>
          <span className={styles.metricSub}>学制 {card.metrics.duration}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>口碑 · 薪资</span>
          <span className={styles.metricValue}>
            <SatisStars value={card.metrics.satisfaction} />
            <span style={{ fontSize: 13, marginLeft: 4 }}>{card.metrics.satisfaction.toFixed(1)}</span>
          </span>
          <span className={styles.metricSub}>
            月薪 {card.metrics.avgSalary} · 样本 {card.metrics.satisfactionSample >= 1000 ? `${(card.metrics.satisfactionSample / 1000).toFixed(1)}k` : card.metrics.satisfactionSample}
          </span>
        </div>
      </div>

      {/* 专业列表（精简） */}
      <div className={styles.majorBox}>
        <div className={styles.majorHead}>
          <div className={styles.majorHeadTitle}>
            组内 <b>{card.majorStat.total}</b> 个专业
          </div>
          <div className={styles.majorHeadCount}>
            <span className={`${styles.majorCount} ${styles.rec}`}>推荐 {card.majorStat.recommended}</span>
            <span className={`${styles.majorCount} ${styles.bak}`}>备选 {card.majorStat.backup}</span>
            <span className={`${styles.majorCount} ${styles.risk}`}>风险 {card.majorStat.risk}</span>
          </div>
        </div>
        <div className={styles.majorList}>
          {card.topMajors.map((m) => (
            <MajorRow key={m.code} major={m} />
          ))}
        </div>
        <button className={styles.expandMore} onClick={onToggle}>
          {expanded ? (
            <>收起完整专业表 <UpOutlined /></>
          ) : (
            <>展开全部 {card.majorStat.total} 个专业 + 数据依据</>
          )}
        </button>
      </div>

      {/* 同分相近录取参考 */}
      <SimilarStudentsBar data={card.similarStudents} />

      {/* 警示条 */}
      {card.warnings.map((w, i) => (
        <div
          key={i}
          className={`${styles.warningBar} ${
            w.level === 'danger' ? styles.danger : w.level === 'info' ? styles.info : ''
          }`}
        >
          <span className={styles.warningIcon}>{w.icon}</span>
          <div>{w.content}</div>
        </div>
      ))}

      {/* 展开态 */}
      {expanded && <ExpandedView card={card} />}
    </article>
  );
}

// ============ 子组件：展开态（完整专业表 + 数据依据） ============
function ExpandedView({ card }: { card: PreviewCard }) {
  const [tab, setTab] = useState<'majors' | 'evidence' | 'school'>('majors');

  return (
    <div className={styles.expandedSection}>
      <div className={styles.expandedTabs}>
        <button className={`${styles.expandedTab} ${tab === 'majors' ? styles.active : ''}`} onClick={() => setTab('majors')}>
          完整专业表（{card.majorStat.total}）
        </button>
        <button className={`${styles.expandedTab} ${tab === 'evidence' ? styles.active : ''}`} onClick={() => setTab('evidence')}>
          数据依据 / 模型校验
        </button>
        <button className={`${styles.expandedTab} ${tab === 'school' ? styles.active : ''}`} onClick={() => setTab('school')}>
          院校详情
        </button>
      </div>

      {tab === 'majors' && (
        <div className={styles.fullMajorTable}>
          <table>
            <thead>
              <tr>
                <th>专业名称</th>
                <th>评级</th>
                <th>近 3 年最低分</th>
                <th>近 3 年最低位次</th>
                <th>招生</th>
                <th>学位点</th>
                <th>梯度</th>
                <th>专业备注</th>
              </tr>
            </thead>
            <tbody>
              {card.topMajors.map((m) => (
                <tr key={m.code}>
                  <td>
                    <b>{m.name}</b>
                    <div style={{ fontSize: 11, color: 'var(--t4)', fontFamily: 'monospace', marginTop: 2 }}>{m.code}</div>
                  </td>
                  <td>
                    <span className={`${styles.majorRanking} ${
                      m.ranking === 'A+' ? styles.majorRankingAplus :
                      m.ranking === 'A' ? styles.majorRankingA :
                      m.ranking === 'B+' ? styles.majorRankingBplus :
                      m.ranking === 'B' ? styles.majorRankingB :
                      styles.majorRankingC
                    }`}>
                      {m.ranking}
                    </span>
                  </td>
                  <td>
                    <span className={styles.miniTrend}>
                      {m.scores3y.map((p, i) => (
                        <span key={p.year}>
                          {i > 0 && <span style={{ color: 'var(--t5)' }}> · </span>}
                          <b>{p.score}</b>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <span className={styles.miniTrend}>
                      {m.scores3y.map((p, i) => (
                        <span key={p.year} style={{ color: 'var(--t3)', fontWeight: 500 }}>
                          {i > 0 && <span style={{ color: 'var(--t5)' }}> · </span>}
                          {p.rank.toLocaleString()}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td><b>{m.planCount}</b> 人</td>
                  <td>
                    <div className={styles.degree}>
                      <span className={m.master ? styles.has : ''}>硕</span>
                      <span className={m.doctoral ? styles.has : ''}>博</span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.majorSection} ${
                      m.section === 'RECOMMENDED' ? styles.majorSectionRec :
                      m.section === 'RISK' ? styles.majorSectionRisk :
                      styles.majorSectionBak
                    }`}>
                      {m.section === 'RECOMMENDED' ? '推荐' : m.section === 'RISK' ? '风险' : '备选'}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {m.notes || (m.isSino ? '中外合办，学费较高' : m.isNew ? '新增专业，数据有限' : m.isNational ? '国家特色专业' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'evidence' && (
        <div className={styles.expertEvidence}>
          <div>
            <h4>位次依据</h4>
            <div className={styles.evidenceItem}>
              学生当前位次 <b>11,340</b>（按 2025 一分一段表换算），组最低位次 {card.history3y[card.history3y.length - 1].rank.toLocaleString()}，位次差 {card.rankDelta}。位次稳定性评分 0.82 / 1.0
            </div>
          </div>
          <div>
            <h4>计划变化</h4>
            <div className={styles.evidenceItem}>
              2025 年招 {card.metrics.planCount - card.metrics.planDelta} 人 → 2026 年招 <b>{card.metrics.planCount} 人</b>
              （{card.metrics.planDelta > 0 ? '+' : ''}{card.metrics.planDelta}，{card.metrics.planDelta > 0 ? '扩招' : card.metrics.planDelta < 0 ? '缩招' : '持平'}）。
              专业组招生稳定性：{card.metrics.planDelta >= 0 ? '良好' : '需复核'}
            </div>
          </div>
          <div>
            <h4>竞争变化</h4>
            <div className={styles.evidenceItem}>
              2025 年同选科组合考生数较 2024 年 +3.2%（理科物化）；该专业组报录比预计 {card.gradient === 'rush' ? '5.8:1' : card.gradient === 'stable' ? '3.2:1' : '1.9:1'}
            </div>
          </div>
          <div>
            <h4>风险提示</h4>
            <div className={styles.evidenceItem}>
              {card.warnings.length > 0
                ? card.warnings.map((w, i) => <div key={i}>{w.content}</div>)
                : '无明显风险，可作为常规候选'}
            </div>
          </div>
        </div>
      )}

      {tab === 'school' && (
        <div className={styles.expertEvidence}>
          <div>
            <h4>办学层次</h4>
            <div className={styles.evidenceItem}>
              {card.tiers.includes('985') && '985 工程 · '}
              {card.tiers.includes('211') && '211 工程 · '}
              {card.tiers.includes('DFC') && '双一流建设高校 · '}
              {card.runningNature}本科
            </div>
          </div>
          <div>
            <h4>排名参考</h4>
            <div className={styles.evidenceItem}>
              软科中国大学排名 <b>#{card.softRank}</b> · QS World #—— · 校友会 #——
            </div>
          </div>
          <div>
            <h4>校区地理</h4>
            <div className={styles.evidenceItem}>
              主校区位于 <b>{card.city} {card.district}</b>；该专业组在主校区就读，4 年内不调整校区
            </div>
          </div>
          <div>
            <h4>学科建设</h4>
            <div className={styles.evidenceItem}>
              A 类学科 <b>16</b> 个 · 一流学科 <b>5</b> 个 · 国家重点实验室 <b>3</b> 个 · 第四轮学科评估优势学科：计算机科学与技术 A+
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 主页面 ============
// 按梯度顺序排序的卡数组
const SORTED_CARDS = [...SAMPLE_CARDS].sort(
  (a, b) =>
    GRADE_ORDER.indexOf(a.gradeLabel as GradeKey) -
    GRADE_ORDER.indexOf(b.gradeLabel as GradeKey)
);

// 每个梯度桶的卡数量
const BUCKET_COUNTS: Record<GradeKey, number> = GRADE_ORDER.reduce(
  (acc, k) => ({ ...acc, [k]: SORTED_CARDS.filter((c) => c.gradeLabel === k).length }),
  {} as Record<GradeKey, number>
);

// ============ 子组件：左侧梯度导航 ============
function GradeNav({ bucketCounts, total }: { bucketCounts: Record<GradeKey, number>; total: number }) {
  return (
    <aside className={styles.gradeNav}>
      <div className={styles.gradeNavTitle}>梯度导航</div>
      <div className={styles.gradeNavList}>
        {GRADE_ORDER.map((k) => {
          const count = bucketCounts[k];
          const tone = GRADE_TONE[k];
          const toneClass =
            tone === 'rush' ? styles.gradeNavItemRush :
            tone === 'rushSoft' ? styles.gradeNavItemRushSoft :
            tone === 'stable' ? styles.gradeNavItemStable :
            tone === 'stableSoft' ? styles.gradeNavItemStableSoft :
            tone === 'safe' ? styles.gradeNavItemSafe :
            styles.gradeNavItemSafeSoft;
          return (
            <a
              key={k}
              href={count > 0 ? `#g-${k}` : undefined}
              className={`${styles.gradeNavItem} ${toneClass} ${count === 0 ? styles.gradeNavItemDisabled : ''}`}
            >
              <span className={styles.gradeNavLabel}>{k}</span>
              <span className={styles.gradeNavCount}>{count}</span>
            </a>
          );
        })}
      </div>
      <div className={styles.gradeNavFooter}>
        共 <b>{total}</b> 个候选
      </div>
    </aside>
  );
}

// ============ 筛选状态类型 ============
type ProvinceFilter = 'all' | 'local' | 'outside';
type SortBy = 'gradient' | 'match';
type TierFilter = '985' | '211' | 'DFC' | 'other';

interface Filters {
  grades: Set<GradeKey>;
  tiers: Set<TierFilter>;
  province: ProvinceFilter;
  sortBy: SortBy;
}

const DEFAULT_FILTERS: Filters = {
  grades: new Set(GRADE_ORDER),
  tiers: new Set<TierFilter>(['985', '211', 'DFC', 'other']),
  province: 'all',
  sortBy: 'gradient',
};

// ============ 子组件：筛选条 ============
function FilterBar({
  filters,
  setFilters,
  filteredCount,
  totalCount,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  filteredCount: number;
  totalCount: number;
}) {
  const toggleGrade = (g: GradeKey) => {
    const next = new Set(filters.grades);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setFilters({ ...filters, grades: next });
  };
  const toggleTier = (t: TierFilter) => {
    const next = new Set(filters.tiers);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setFilters({ ...filters, tiers: next });
  };

  const isDefault =
    filters.grades.size === GRADE_ORDER.length &&
    filters.tiers.size === 4 &&
    filters.province === 'all' &&
    filters.sortBy === 'gradient';

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>梯度</span>
        <div className={styles.filterChips}>
          {GRADE_ORDER.map((g) => (
            <button
              key={g}
              className={`${styles.filterChip} ${filters.grades.has(g) ? styles.filterChipActive : ''}`}
              onClick={() => toggleGrade(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>院校档次</span>
        <div className={styles.filterChips}>
          {(['985', '211', 'DFC', 'other'] as TierFilter[]).map((t) => (
            <button
              key={t}
              className={`${styles.filterChip} ${filters.tiers.has(t) ? styles.filterChipActive : ''}`}
              onClick={() => toggleTier(t)}
            >
              {t === 'DFC' ? '双一流' : t === 'other' ? '其他' : t}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>地域</span>
        <div className={styles.filterChips}>
          {([
            { v: 'all' as const, label: '不限' },
            { v: 'local' as const, label: '本省' },
            { v: 'outside' as const, label: '外省' },
          ]).map((o) => (
            <button
              key={o.v}
              className={`${styles.filterChip} ${filters.province === o.v ? styles.filterChipActive : ''}`}
              onClick={() => setFilters({ ...filters, province: o.v })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>排序</span>
        <div className={styles.filterChips}>
          <button
            className={`${styles.filterChip} ${filters.sortBy === 'gradient' ? styles.filterChipActive : ''}`}
            onClick={() => setFilters({ ...filters, sortBy: 'gradient' })}
          >
            梯度顺序
          </button>
          <button
            className={`${styles.filterChip} ${filters.sortBy === 'match' ? styles.filterChipActive : ''}`}
            onClick={() => setFilters({ ...filters, sortBy: 'match' })}
          >
            匹配度高→低
          </button>
        </div>
      </div>
      <div className={styles.filterRight}>
        <span className={styles.filterCount}>
          {filteredCount === totalCount
            ? <>共 <b>{totalCount}</b> 个</>
            : <>显示 <b>{filteredCount}</b> / {totalCount} 个</>
          }
        </span>
        {!isDefault ? (
          <button className={styles.filterReset} onClick={() => setFilters(DEFAULT_FILTERS)}>
            重置
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============ 子组件：被隐藏的卡（紧凑单行）============
function HiddenCard({ card, onRestore }: { card: PreviewCard; onRestore: () => void }) {
  return (
    <div className={styles.hiddenCard}>
      <span className={styles.hiddenCardIcon}>✕</span>
      <div className={styles.hiddenCardInfo}>
        <b>{card.universityName}</b>
        <span className={styles.hiddenCardMeta}>
          {card.gradeLabel} · 软科 #{card.softRank} · {card.city}
        </span>
      </div>
      <span className={styles.hiddenCardReason}>已排除</span>
      <button className={styles.hiddenCardBtn} onClick={onRestore}>恢复</button>
    </div>
  );
}

// ============ 右侧 rail：方案健康度 ============
function HealthCard({ totalCandidates }: { totalCandidates: number }) {
  const h = PLAN_HEALTH;
  const total = h.gradientDist.rush + h.gradientDist.stable + h.gradientDist.safe || 1;
  const rushPct = (h.gradientDist.rush / total) * 100;
  const stablePct = (h.gradientDist.stable / total) * 100;
  const safePct = (h.gradientDist.safe / total) * 100;

  return (
    <div className={styles.railCard}>
      <h3 className={styles.railCardTitle}>当前方案健康度</h3>
      <div className={styles.healthStatsRow}>
        <div className={styles.healthStat}>
          <span className={styles.healthStatLabel}>已选</span>
          <strong className={styles.healthStatValue}>{h.selectedCount}</strong>
        </div>
        <div className={styles.healthStat}>
          <span className={styles.healthStatLabel}>风险</span>
          <strong className={`${styles.healthStatValue} ${h.riskCount > 0 ? styles.healthStatValueDanger : ''}`}>
            {h.riskCount}
          </strong>
        </div>
        <div className={styles.healthStat}>
          <span className={styles.healthStatLabel}>状态</span>
          <strong className={styles.healthStatValue} style={{ fontSize: 14 }}>{h.status}</strong>
        </div>
      </div>

      {/* 冲稳保进度条 */}
      <div className={styles.distBar}>
        <div className={styles.distBarRush} style={{ width: `${rushPct}%` }} />
        <div className={styles.distBarStable} style={{ width: `${stablePct}%` }} />
        <div className={styles.distBarSafe} style={{ width: `${safePct}%` }} />
      </div>
      <div className={styles.distLabels}>
        <span>冲类 {h.gradientDist.rush}</span>
        <span>稳类 {h.gradientDist.stable}</span>
        <span>保类 {h.gradientDist.safe}</span>
      </div>

      <div className={styles.healthGapList}>
        <div><span>候选池</span><b>{totalCandidates} 个专业组</b></div>
        <div><span>排序位次</span><b>{STUDENT_CONTEXT.sortRank.toLocaleString()} 位</b></div>
        <div><span>资料状态</span><b>{STUDENT_CONTEXT.intakeStatus}</b></div>
      </div>
    </div>
  );
}

// ============ 右侧 rail：已选专业组 ============
function SelectedPlanList() {
  return (
    <div className={styles.railCard}>
      <h3 className={styles.railCardTitle}>已选专业组</h3>
      {SELECTED_PLAN_ITEMS.length === 0 ? (
        <div className={styles.railEmpty}>
          从左侧候选池加入志愿项
        </div>
      ) : (
        <div className={styles.selectedList}>
          {SELECTED_PLAN_ITEMS.map((item) => {
            const tone = GRADE_TONE[item.gradient];
            const toneClass =
              tone === 'rush' ? styles.selectedToneRush :
              tone === 'rushSoft' ? styles.selectedToneRushSoft :
              tone === 'stable' ? styles.selectedToneStable :
              tone === 'stableSoft' ? styles.selectedToneStableSoft :
              tone === 'safe' ? styles.selectedToneSafe :
              styles.selectedToneSafeSoft;
            return (
              <div key={item.id} className={styles.selectedItem}>
                <div className={styles.selectedTop}>
                  <div className={styles.selectedNameLine}>
                    <span className={styles.selectedOrder}>{item.order}.</span>
                    <span className={styles.selectedName}>{item.universityName}</span>
                    <span className={`${styles.selectedGradeTag} ${toneClass}`}>{item.gradient}</span>
                  </div>
                  <button className={styles.selectedDelBtn} title="移除">✕</button>
                </div>
                <div className={styles.selectedMeta}>
                  专业组 {item.groupCode.replace(' 组', '')} · {item.groupName} ·
                  <span className={styles.selectedRank}> {item.rank.toLocaleString()} 位</span>
                </div>
                <div className={styles.selectedMajors}>
                  {item.majors.map((m, i) => (
                    <span key={m} className={styles.selectedMajorTag}>
                      {i > 0 && <span className={styles.selectedSep}>·</span>}
                      {m}
                    </span>
                  ))}
                </div>
                <button className={styles.selectedExpand}>▸ 展开组内专业</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ 右侧 rail：下一步建议 ============
function NextStepCard() {
  return (
    <div className={styles.railCard}>
      <h3 className={styles.railCardTitle}>下一步建议</h3>
      <div className={styles.suggestionBox}>
        <span className={styles.suggestionMark}>i</span>
        <ol className={styles.suggestionList}>
          <li>优先补足<b>冲类</b>志愿，当前 0 个，建议 ≥ 4 个；可参考左侧"极冲 / 冲"梯度</li>
          <li>稳类已有 2 个，再加 4-8 个达到推荐数量</li>
          <li>保类已有 1 个，建议增加兜底以避免滑档</li>
        </ol>
      </div>
      <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ width: '100%', marginTop: 8 }}>
        ✓ 提交主管审核
      </button>
    </div>
  );
}

// ============ 子组件：工作台顶部 ============
function WorkbenchHeader() {
  return (
    <div className={styles.workbenchHeader}>
      <div>
        <h1 className={styles.workbenchTitle}>生成方案工作台</h1>
        <p className={styles.workbenchSubtitle}>
          学生：{STUDENT_CONTEXT.name} · 当前方案按后端候选池实时计算
        </p>
      </div>
      <div className={styles.workbenchActions}>
        <div className={styles.batchSelect}>
          <SoundOutlined style={{ opacity: 0.4 }} />
          <span>{BATCH_OPTIONS[0].label}</span>
          <span style={{ opacity: 0.4, marginLeft: 8 }}>▾</span>
        </div>
        <button className={styles.btnAction}>
          <FileTextOutlinedSafe /> 打开已有方案
        </button>
        <button className={styles.btnAction}>查看详情</button>
        <button className={`${styles.btnAction} ${styles.btnActionPrimary}`}>
          ▸ 提交审核
        </button>
      </div>
    </div>
  );
}

// 占位用 file icon（避免再 import）
function FileTextOutlinedSafe() {
  return <span style={{ fontSize: 12 }}>📄</span>;
}

// ============ 子组件：单个 Stat 卡 ============
function StatCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.statCard} ${accent ? styles.statCardAccent : ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {note ? <div className={styles.statNote}>{note}</div> : null}
    </div>
  );
}

// ============ 子组件：学生信息 Panel ============
function ProfilePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.profilePanel}>
      <div className={styles.profilePanelHead}>{title}</div>
      <div className={styles.profilePanelBody}>{children}</div>
    </div>
  );
}

function ProfileLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.profileLine}>
      <span className={styles.profileLineLabel}>{label}</span>
      <div className={styles.profileLineValue}>{children}</div>
    </div>
  );
}

function ChipList({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'good' | 'warn' | 'bad' | 'info' }) {
  if (items.length === 0) return <span className={styles.profileEmpty}>暂无</span>;
  const toneClass =
    tone === 'good' ? styles.chipGood :
    tone === 'warn' ? styles.chipWarn :
    tone === 'bad' ? styles.chipBad :
    tone === 'info' ? styles.chipInfo :
    styles.chipDefault;
  return (
    <span className={styles.chipList}>
      {items.map((it) => (
        <span key={it} className={`${styles.chip} ${toneClass}`}>{it}</span>
      ))}
    </span>
  );
}

// ============ 子组件：学生完整信息区（5 stat + 3 panel + 已有方案）============
function StudentInfoSection() {
  const s = STUDENT_CONTEXT;
  return (
    <section className={styles.studentInfoSection}>
      {/* 5 个 stat 卡 */}
      <div className={styles.statRow}>
        <StatCard label="总分" value={<>{s.totalScore} 分</>} note="一分一段暂用 2025 年" accent />
        <StatCard label="档案位次" value={<>{s.storedRank.toLocaleString()} 位</>} note="学生档案记录" accent />
        <StatCard label="排序位次" value={<>{s.sortRank.toLocaleString()} 位</>} note="候选池计算口径" accent />
        <StatCard label="资料状态" value={s.intakeStatusLabel} note={s.intakeStatus} />
        <StatCard label="选科组合" value={s.subjectCombination} note={s.examSource} />
      </div>

      {/* 3 个 panel */}
      <div className={styles.profileRow}>
        <ProfilePanel title="科目结构">
          <div className={styles.subjectGrid}>
            <StatCard label="语文" value={`${s.scoreChinese} 分`} />
            <StatCard label="数学" value={`${s.scoreMath} 分`} />
            <StatCard label="英语" value={`${s.scoreEnglish} 分`} />
            <StatCard label="首选科目" value={`${s.scoreFirstChoice} 分`} />
            <StatCard label="再选一" value={`${s.scoreSub1} 分`} />
            <StatCard label="再选二" value={`${s.scoreSub2} 分`} />
          </div>
          <ProfileLine label="优势科目">
            <ChipList items={s.strengths} tone="good" />
          </ProfileLine>
          <ProfileLine label="短板科目">
            <ChipList items={s.weaknesses} tone="warn" />
          </ProfileLine>
        </ProfilePanel>

        <ProfilePanel title="意向信息">
          <ProfileLine label="优先模式"><b>{s.priorityMode}</b></ProfileLine>
          <ProfileLine label="留省偏好"><b>{s.stayPreference}</b></ProfileLine>
          <ProfileLine label="升学/职业">
            <b>{s.careerPlan}</b>
            {s.careerDirection ? <span className={styles.profileLight}> · {s.careerDirection}</span> : null}
          </ProfileLine>
          <ProfileLine label="地域意向"><ChipList items={s.preferredCities} tone="info" /></ProfileLine>
          <ProfileLine label="院校意向"><ChipList items={s.preferredUniversities} tone="info" /></ProfileLine>
          <ProfileLine label="专业意向"><ChipList items={s.preferredMajors} tone="good" /></ProfileLine>
          <ProfileLine label="意向批次"><ChipList items={s.preferredBatches} tone="default" /></ProfileLine>
        </ProfilePanel>

        <ProfilePanel title="排除与红线">
          <ProfileLine label="排除地域"><ChipList items={s.excludedProvinces} tone="bad" /></ProfileLine>
          <ProfileLine label="排除院校"><ChipList items={s.excludedUniversities} tone="bad" /></ProfileLine>
          <ProfileLine label="排除专业"><ChipList items={s.excludedMajors} tone="bad" /></ProfileLine>
          <ProfileLine label="接受边界"><ChipList items={s.riskPreferences} tone="warn" /></ProfileLine>
          <ProfileLine label="身体限制"><ChipList items={s.physicalLimits} tone="warn" /></ProfileLine>
          <ProfileLine label="其他要求">
            {s.otherRequirements ? <b>{s.otherRequirements}</b> : <span className={styles.profileEmpty}>—</span>}
          </ProfileLine>
        </ProfilePanel>
      </div>

      {/* 已有方案行 */}
      <div className={styles.existingPlansRow}>
        <span className={styles.existingPlansLabel}>已有方案</span>
        {EXISTING_PLANS.map((p) => (
          <button
            key={p.id}
            className={`${styles.existingPlanBtn} ${p.active ? styles.existingPlanBtnActive : ''}`}
          >
            {p.batchName} · V{p.versionNo} · {p.status}
          </button>
        ))}
      </div>
    </section>
  );
}

// ============ 子组件：候选对比面板 ============
function ComparePanel({ cards }: { cards: PreviewCard[] }) {
  if (cards.length === 0) {
    return <div className={styles.compareEmpty}>未选择任何候选</div>;
  }

  const rows: Array<{
    key: string;
    label: string;
    render: (c: PreviewCard) => React.ReactNode;
  }> = [
    {
      key: 'tiers',
      label: '院校档次',
      render: (c) => (
        <div className={styles.compareTierCell}>
          <TierBadges tiers={c.tiers} />
          <span className={styles.compareSubtext}>软科 #{c.softRank} · {c.runningNature}</span>
        </div>
      ),
    },
    {
      key: 'city',
      label: '城市 · 校区',
      render: (c) => <span>{c.city} · {c.district}</span>,
    },
    {
      key: 'gradient',
      label: '梯度',
      render: (c) => {
        const cls =
          c.gradient === 'rush' ? styles.compareGradeRush :
          c.gradient === 'stable' ? styles.compareGradeStable :
          styles.compareGradeSafe;
        return (
          <div>
            <span className={`${styles.compareGradeBadge} ${cls}`}>{c.gradeLabel}</span>
            <div className={styles.compareSubtext} style={{ marginTop: 4 }}>
              {c.rankGapAbs > 0 ? `学生领先 ${c.rankGapAbs.toLocaleString()} 名` : `学生落后 ${Math.abs(c.rankGapAbs).toLocaleString()} 名`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'match',
      label: '匹配度',
      render: (c) => {
        const tone = c.matchScore >= 85 ? styles.compareMatchHigh : c.matchScore >= 70 ? styles.compareMatchMid : styles.compareMatchLow;
        return (
          <div className={styles.compareMatchCell}>
            <span className={`${styles.compareMatchValue} ${tone}`}>{c.matchScore}</span>
            <span className={styles.compareSubtext}>{c.matchReason}</span>
          </div>
        );
      },
    },
    {
      key: 'filing',
      label: '2025 投档线',
      render: (c) => {
        const last = c.historyFiling3y[c.historyFiling3y.length - 1];
        const prev = c.historyFiling3y[c.historyFiling3y.length - 2];
        const delta = last.score - prev.score;
        return (
          <div>
            <span className={styles.compareNum}>{last.score}</span>
            <span className={`${styles.compareDelta} ${delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaFlat}`}>
              {delta > 0 ? '+' : ''}{delta}
            </span>
            <div className={styles.compareSubtext}>位次 {last.rank.toLocaleString()}</div>
          </div>
        );
      },
    },
    {
      key: 'pred',
      label: '2026 预测',
      render: (c) => {
        const p = c.prediction2026;
        const tone = p.confidence === 'high' ? styles.predHigh : p.confidence === 'medium' ? styles.predMed : styles.predLow;
        return (
          <div>
            <span className={styles.compareNum}>{p.score}</span>
            <span className={styles.predRange}> ±{Math.max(p.score - p.scoreLow, p.scoreHigh - p.score)}</span>
            <div className={`${styles.predConfidence} ${tone}`} style={{ marginTop: 4 }}>
              {p.confidence === 'high' ? '高' : p.confidence === 'medium' ? '中' : '低'}信心
            </div>
          </div>
        );
      },
    },
    {
      key: 'plan',
      label: '本组招生',
      render: (c) => (
        <div>
          <span className={styles.compareNum}>{c.metrics.planCount}</span>
          <span className={styles.compareSubtext}> 人 </span>
          <span className={`${styles.compareDelta} ${c.metrics.planDelta > 0 ? styles.deltaDown : c.metrics.planDelta < 0 ? styles.deltaUp : styles.deltaFlat}`}>
            {c.metrics.planDelta > 0 ? '+' : ''}{c.metrics.planDelta}
          </span>
        </div>
      ),
    },
    {
      key: 'postgrad',
      label: '保研率',
      render: (c) => <span className={styles.compareNum}>{c.metrics.postgradRate}</span>,
    },
    {
      key: 'tuition',
      label: '学费 / 学制',
      render: (c) => (
        <div>
          <span>{c.metrics.tuition}</span>
          <div className={styles.compareSubtext}>{c.metrics.duration}</div>
        </div>
      ),
    },
    {
      key: 'prefs',
      label: '学生偏好',
      render: (c) => (
        <div className={styles.comparePrefCell}>
          <PrefChip label="本省" value={c.prefMatch.province} kind="province" />
          <PrefChip label="学费" value={c.prefMatch.tuition} kind="tuition" />
          <PrefChip label="考研" value={c.prefMatch.career} kind="career" />
          <PrefChip label="选科" value={c.prefMatch.subjects} kind="subjects" />
        </div>
      ),
    },
    {
      key: 'topMajors',
      label: '推荐 Top 3',
      render: (c) => (
        <ul className={styles.compareMajorList}>
          {c.topMajors.filter((m) => m.section === 'RECOMMENDED').slice(0, 3).map((m) => (
            <li key={m.code}>
              <b>{m.name}</b>
              <span className={`${styles.majorRanking} ${
                m.ranking === 'A+' ? styles.majorRankingAplus :
                m.ranking === 'A' ? styles.majorRankingA :
                m.ranking === 'B+' ? styles.majorRankingBplus :
                styles.majorRankingB
              }`}>{m.ranking}</span>
              <span className={styles.compareSubtext}> 招 {m.planCount}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: 'warnings',
      label: '主要警示',
      render: (c) =>
        c.warnings.length > 0 ? (
          <ul className={styles.compareWarnList}>
            {c.warnings.map((w, i) => (
              <li key={i} className={
                w.level === 'danger' ? styles.compareWarnDanger :
                w.level === 'warn' ? styles.compareWarnWarn :
                styles.compareWarnInfo
              }>
                {w.content}
              </li>
            ))}
          </ul>
        ) : <span className={styles.compareSubtext}>—</span>,
    },
  ];

  return (
    <div className={styles.comparePanel}>
      <div
        className={styles.compareGrid}
        style={{ gridTemplateColumns: `120px repeat(${cards.length}, minmax(220px, 1fr))` }}
      >
        {/* 表头行：学校名 */}
        <div className={styles.compareCornerCell}></div>
        {cards.map((c) => (
          <div key={c.universityName} className={styles.compareHeadCell}>
            <div className={styles.compareHeadName}>{c.universityName}</div>
            <div className={styles.compareSubtext}>{c.groupName}（{c.groupCode}）</div>
          </div>
        ))}
        {/* 数据行 */}
        {rows.map((r) => (
          <React.Fragment key={r.key}>
            <div className={styles.compareLabelCell}>{r.label}</div>
            {cards.map((c) => (
              <div key={c.universityName + r.key} className={styles.compareDataCell}>
                {r.render(c)}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function PreviewCandidateV2Page() {
  // 多卡同时展开（Set 收集已展开的 index）
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set([0]));
  const toggleExpanded = (i: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // 卡片对比（用 universityName 作 key）
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleCompare = (name: string) => {
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else if (next.size < 4) next.add(name);
      return next;
    });
  };
  const compareCards = SORTED_CARDS.filter((c) => compareSet.has(c.universityName));

  // 排除（隐藏）
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set());
  const hideCard = (name: string) =>
    setHiddenSet((prev) => new Set([...prev, name]));
  const restoreCard = (name: string) =>
    setHiddenSet((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });

  // 筛选 + 排序
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const visibleCards = useMemo(() => {
    const filtered = SORTED_CARDS.filter((c) => {
      if (!filters.grades.has(c.gradeLabel as GradeKey)) return false;
      // 档次
      const cardTiers = new Set<TierFilter>();
      if (c.tiers.includes('985')) cardTiers.add('985');
      if (c.tiers.includes('211')) cardTiers.add('211');
      if (c.tiers.includes('DFC')) cardTiers.add('DFC');
      if (!c.tiers.includes('985') && !c.tiers.includes('211') && !c.tiers.includes('DFC')) {
        cardTiers.add('other');
      }
      const tierMatch = [...cardTiers].some((t) => filters.tiers.has(t));
      if (!tierMatch) return false;
      // 地域
      if (filters.province === 'local' && c.prefMatch.province !== 'match') return false;
      if (filters.province === 'outside' && c.prefMatch.province !== 'mismatch') return false;
      return true;
    });
    if (filters.sortBy === 'match') {
      filtered.sort((a, b) => b.matchScore - a.matchScore);
    }
    return filtered;
  }, [filters]);

  const dynamicBucketCounts = useMemo(() => {
    return GRADE_ORDER.reduce(
      (acc, k) => ({
        ...acc,
        [k]: visibleCards.filter((c) => c.gradeLabel === k && !hiddenSet.has(c.universityName)).length,
      }),
      {} as Record<GradeKey, number>
    );
  }, [visibleCards, hiddenSet]);

  return (
    <div className={styles.page}>
      <Link href="/teacher/plans" style={{ display: 'inline-flex', gap: 6, marginBottom: 16, color: 'var(--t3)', fontSize: 13, textDecoration: 'none' }}>
        <ArrowLeftOutlined /> 返回方案列表
      </Link>

      <div className={styles.notice}>
        <span style={{ fontSize: 18 }}>🎨</span>
        <div>
          <strong>候选池卡片重设计预览</strong> — 此页面使用 mock 数据，仅用于视觉评审。
          以下展示 3 张不同梯度的候选卡（稳/冲/保）+ 一张展开态。点击「展开全部专业」可切换 Tab 查看完整专业表 / 数据依据 / 院校详情。
        </div>
      </div>

      {/* 工作台顶部 + 学生完整信息 */}
      <WorkbenchHeader />
      <StudentInfoSection />

      {/* 学生上下文 sticky 条（滚动时常驻） */}
      <div className={styles.studentSticky}>
        <div className={styles.studentStickyAvatar}>{STUDENT_CONTEXT.name.charAt(0)}</div>
        <div className={styles.studentStickyName}>
          <b>{STUDENT_CONTEXT.name}</b>
          <span className={styles.studentStickyMeta}>选科：{STUDENT_CONTEXT.subjects} · 偏好 {STUDENT_CONTEXT.stayPreference}</span>
        </div>
        <div className={styles.studentStickyMetrics}>
          <div className={styles.studentMetric}>
            <span className={styles.studentMetricLabel}>分数</span>
            <span className={styles.studentMetricValue}>{STUDENT_CONTEXT.totalScore}</span>
          </div>
          <div className={styles.studentMetric}>
            <span className={styles.studentMetricLabel}>位次</span>
            <span className={styles.studentMetricValue}>{STUDENT_CONTEXT.rank.toLocaleString()}</span>
          </div>
          <div className={styles.studentMetric}>
            <span className={styles.studentMetricLabel}>批次</span>
            <span className={styles.studentMetricValue} style={{ fontSize: 14 }}>本科批 B 段·物化</span>
          </div>
        </div>
      </div>

      <div className={styles.sectionTitle}>
        <h2>候选池 V2</h2>
        <span>{filters.sortBy === 'match' ? '按匹配度高→低' : '按梯度顺序（极冲→兜底）'} · 顶部学生信息 sticky · 左侧梯度导航</span>
      </div>

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        filteredCount={visibleCards.length}
        totalCount={SORTED_CARDS.length}
      />

      <div className={styles.mainLayout}>
        <div className={styles.mainColumn}>
          <div className={styles.cardList}>
            {visibleCards.length === 0 ? (
              <div className={styles.emptyState}>
                <span style={{ fontSize: 32 }}>🔍</span>
                <div>当前筛选条件下无匹配候选</div>
                <button className={styles.filterReset} onClick={() => setFilters(DEFAULT_FILTERS)}>
                  重置筛选
                </button>
              </div>
            ) : (
              visibleCards.map((card, i) => {
                const prevLabel = i > 0 ? visibleCards[i - 1].gradeLabel : null;
                const isFirstInBucket = prevLabel !== card.gradeLabel && filters.sortBy === 'gradient';
                const anchorId = isFirstInBucket ? `g-${card.gradeLabel}` : undefined;
                if (hiddenSet.has(card.universityName)) {
                  return (
                    <HiddenCard
                      key={card.universityName}
                      card={card}
                      onRestore={() => restoreCard(card.universityName)}
                    />
                  );
                }
                const originalIndex = SORTED_CARDS.findIndex((c) => c.universityName === card.universityName);
                return (
                  <CandidateCard
                    key={card.universityName}
                    card={card}
                    expanded={expandedSet.has(originalIndex)}
                    onToggle={() => toggleExpanded(originalIndex)}
                    anchorId={anchorId}
                    compared={compareSet.has(card.universityName)}
                    onCompareToggle={() => toggleCompare(card.universityName)}
                    onHide={() => hideCard(card.universityName)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* 右侧 rail：梯度导航 + 健康度 + 已选 + 建议 */}
        <aside className={styles.railColumn}>
          <GradeNav bucketCounts={dynamicBucketCounts} total={visibleCards.length - hiddenSet.size} />
          <HealthCard totalCandidates={visibleCards.length} />
          <SelectedPlanList />
          <NextStepCard />
        </aside>
      </div>

      {/* 浮动对比 bar（选了卡才显示） */}
      {compareSet.size > 0 ? (
        <div className={styles.compareBar}>
          <BarsOutlined className={styles.compareBarIcon} />
          <div className={styles.compareBarText}>
            已选 <b>{compareSet.size}</b> / 4 项参与对比
            <div className={styles.compareBarNames}>
              {compareCards.map((c) => c.universityName).join(' · ')}
            </div>
          </div>
          <button
            className={styles.compareBarBtnGhost}
            onClick={() => setCompareSet(new Set())}
          >
            清空
          </button>
          <button
            className={styles.compareBarBtnPrimary}
            disabled={compareSet.size < 2}
            onClick={() => setDrawerOpen(true)}
          >
            打开对比 →
          </button>
        </div>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          <span>
            <BarsOutlined /> 候选对比（{compareCards.length} 项）
          </span>
        }
        width={Math.min(1180, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 1180)}
        placement="right"
        closeIcon={<CloseOutlined />}
      >
        <ComparePanel cards={compareCards} />
      </Drawer>

      <div className={styles.sectionTitle}>
        <h2>本轮新增（与线上 generate 工作台融合）</h2>
        <span>顶部学生信息区 + 右侧 sticky rail</span>
      </div>
      <div style={{ background: 'var(--surface-high)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.7, color: 'var(--t2)' }}>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li><b>工作台顶部操作栏</b>：标题 + 批次选择 + 「打开已有方案 / 查看详情 / 提交审核」按钮，与线上对齐</li>
          <li><b>学生 5 大 stat 卡</b>：总分 / 档案位次 / 排序位次 / 资料状态 / 选科组合，前 3 项 accent 高亮</li>
          <li><b>学生 3 大 panel</b>：科目结构（6 科成绩 + 优势/短板 chip）· 意向信息（优先模式 / 留省偏好 / 升学职业 / 4 类意向 chip）· 排除与红线（4 类排除 / 接受边界 / 身体限制 / 其他要求）</li>
          <li><b>已有方案行</b>：「本科批B段·V1·DRAFT」深蓝按钮（active 态），同时显示其他批次按钮</li>
          <li><b>右侧 sticky rail 4 块</b>：
            <ul style={{ marginTop: 4 }}>
              <li>① 梯度导航（从左侧迁过来，融入 rail 顶部）</li>
              <li>② 当前方案健康度：已选 / 风险 / 状态 三 stat + <b>冲稳保进度条</b>（红蓝绿色块按比例）+ 候选池 / 排序位次 / 资料状态 gap list</li>
              <li>③ 已选专业组：3 个 mock 项（川大稳 / 中财稳保 / 西交保），含梯度色 tag + 删除按钮 + 组内专业 + 排序位次</li>
              <li>④ 下一步建议：基于健康度的智能提示（如「冲类 0 个，建议 ≥ 4」）+ 提交审核大按钮</li>
            </ul>
          </li>
        </ol>
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--primary-fixed)', borderRadius: 7, fontSize: 12, color: 'var(--primary)' }}>
          🧪 <b>试试看</b>：① 滚动页面 → 右侧 rail 全部 4 块都 sticky 跟随；② 筛选条切换 → 健康度的「候选池」数字 + 梯度导航桶 数同步更新；③ 顶部蓝色 sticky 条与右侧 rail 同时常驻
        </div>
      </div>
    </div>
  );
}
