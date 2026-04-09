/**
 * 2025年四川省普通高校招生批次志愿配置种子数据
 * 根据官方文件：川招考委〔2025〕5号
 * 《四川省2025年普通高校招生考试和录取工作实施方案》
 */

interface BatchConfigSeed {
  year: number;
  province: string;
  batch: string;
  examType: string;
  volunteerMode: 'parallel' | 'sequential';
  maxGroupCount: number;
  maxMajorPerGroup: number;
  hasAdjustOption: boolean;
  filingRatio: string;
  admissionOrder: number;
  description: string;
  tiebreakRules: object | null;
}

// 普通类同分排序规则（2025新高考）
const normalTiebreakRules = {
  rules: [
    { order: 1, name: '语文+数学之和', desc: '语文数学两科之和' },
    { order: 2, name: '语数单科最高', desc: '语文数学两科中单科最高成绩' },
    { order: 3, name: '外语', desc: '外语单科成绩' },
    { order: 4, name: '首选科目', desc: '首选科目单科成绩' },
    { order: 5, name: '再选科目最高', desc: '再选科目单科最高成绩' },
    { order: 6, name: '再选科目次高', desc: '再选科目单科次高成绩' },
  ],
};

const configs: BatchConfigSeed[] = [];

// 为物理和历史分别生成配置
for (const examType of ['物理', '历史']) {
  // 0. 强基计划（在所有批次前）
  // 强基计划不通过常规志愿填报，此处不纳入

  // 1. 本科提前批次国家专项计划
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科提前批(国家专项)',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 2,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 1,
    description: '安排在强基录取后、本科提前批次A段投档前投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 2. 本科提前批次A段
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科提前批A段',
    examType,
    volunteerMode: 'sequential',
    maxGroupCount: 3, // 1个第一志愿 + 2个平行的第二志愿
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 2,
    description: '含飞行技术、军事类、公安类、司法类、航海类、消防救援、高校综合评价等本科招生高校（专业）。设置1个院校专业组第一志愿和2个平行的院校专业组第二志愿',
    tiebreakRules: normalTiebreakRules,
  });

  // 3. 本科提前批次高校专项计划
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科提前批(高校专项)',
    examType,
    volunteerMode: 'sequential',
    maxGroupCount: 1,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 3,
    description: '安排在本科提前批次A段录取后、B段投档前投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 4. 本科提前批次B段
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科提前批B段',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 30,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 4,
    description: '含国家公费师范生、国家优师专项、农村订单定向医学生、省级公费师范生、地方优师计划、乡村振兴计划、全国重点马克思主义学院马理论专业、部分院校小语种专业、本科提前批次少数民族预科、参加我省统一录取的香港高校等本科招生高校（专业）',
    tiebreakRules: normalTiebreakRules,
  });

  // 5. 本科批次A段（国家专项计划）
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科批A段(国家专项)',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 5,
    description: '本科批次A段含国家专项计划，均实行平行志愿，依次投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 6. 本科批次A段（地方专项计划）
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科批A段(地方专项)',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 6,
    description: '本科批次A段含地方专项计划，均实行平行志愿，依次投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 7. 本科批次高校专项计划
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科批(高校专项)',
    examType,
    volunteerMode: 'sequential',
    maxGroupCount: 2,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 7,
    description: '安排在本科批次A段录取后、B段投档前依次投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 8. 本科批次B段
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科批B段',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 8,
    description: '本科提前批次及本科批次A段以外的本科招生高校（专业），包括部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科、民族班、定向招生、纳入普通类招生的艺术类专业等',
    tiebreakRules: normalTiebreakRules,
  });

  // 9. 区域教育均衡发展专项（B段之后）
  configs.push({
    year: 2025,
    province: '四川',
    batch: '本科批(区域教育均衡发展专项)',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 20,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 9,
    description: '上述本科高校（专业）招生结束后，安排区域教育均衡发展专项计划、省属高校少数民族预科一并投档录取',
    tiebreakRules: normalTiebreakRules,
  });

  // 10. 高职(专科)提前批次
  configs.push({
    year: 2025,
    province: '四川',
    batch: '专科提前批',
    examType,
    volunteerMode: 'sequential',
    maxGroupCount: 3, // 1个第一志愿 + 2个平行的第二志愿
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '≤120%',
    admissionOrder: 10,
    description: '含定向培养军士、公安类、司法类、航海类等经批准可纳入提前批次录取的高职(专科)招生高校(专业)',
    tiebreakRules: normalTiebreakRules,
  });

  // 11. 高职(专科)批次
  configs.push({
    year: 2025,
    province: '四川',
    batch: '专科批',
    examType,
    volunteerMode: 'parallel',
    maxGroupCount: 45,
    maxMajorPerGroup: 6,
    hasAdjustOption: true,
    filingRatio: '1:1',
    admissionOrder: 11,
    description: '高职(专科)提前批次以外的其他高职(专科)招生高校(专业)',
    tiebreakRules: normalTiebreakRules,
  });
}

export default configs;

// 如果直接运行，输出 JSON
if (require.main === module) {
  console.log(JSON.stringify(configs, null, 2));
  console.log(`\n共 ${configs.length} 条配置`);
}
