/**
 * 教育部《普通高等学校本科专业目录》专业类（一级学科）
 * 2024 年版，共 92 类。code 为 4 位编码，categoryCode 对应 MAJOR_CATEGORIES 的 2 位门类码。
 * 注：工学（08）按 2024 目录收录 31 类（不含 0832 交叉工程类，该类归入交叉学科门类管理）
 */
export interface MajorSubCategory {
  code: string;         // 4 位编码，如 "0809"
  name: string;         // 类名，如 "计算机类"
  categoryCode: string; // 2 位门类码，如 "08" (= 工学)
}

export const MAJOR_SUB_CATEGORIES: MajorSubCategory[] = [
  // 01 哲学 (1)
  { code: '0101', name: '哲学类', categoryCode: '01' },
  // 02 经济学 (4)
  { code: '0201', name: '经济学类', categoryCode: '02' },
  { code: '0202', name: '财政学类', categoryCode: '02' },
  { code: '0203', name: '金融学类', categoryCode: '02' },
  { code: '0204', name: '经济与贸易类', categoryCode: '02' },
  // 03 法学 (6)
  { code: '0301', name: '法学类', categoryCode: '03' },
  { code: '0302', name: '政治学类', categoryCode: '03' },
  { code: '0303', name: '社会学类', categoryCode: '03' },
  { code: '0304', name: '民族学类', categoryCode: '03' },
  { code: '0305', name: '马克思主义理论类', categoryCode: '03' },
  { code: '0306', name: '公安学类', categoryCode: '03' },
  // 04 教育学 (2)
  { code: '0401', name: '教育学类', categoryCode: '04' },
  { code: '0402', name: '体育学类', categoryCode: '04' },
  // 05 文学 (3)
  { code: '0501', name: '中国语言文学类', categoryCode: '05' },
  { code: '0502', name: '外国语言文学类', categoryCode: '05' },
  { code: '0503', name: '新闻传播学类', categoryCode: '05' },
  // 06 历史学 (1)
  { code: '0601', name: '历史学类', categoryCode: '06' },
  // 07 理学 (12)
  { code: '0701', name: '数学类', categoryCode: '07' },
  { code: '0702', name: '物理学类', categoryCode: '07' },
  { code: '0703', name: '化学类', categoryCode: '07' },
  { code: '0704', name: '天文学类', categoryCode: '07' },
  { code: '0705', name: '地理科学类', categoryCode: '07' },
  { code: '0706', name: '大气科学类', categoryCode: '07' },
  { code: '0707', name: '海洋科学类', categoryCode: '07' },
  { code: '0708', name: '地球物理学类', categoryCode: '07' },
  { code: '0709', name: '地质学类', categoryCode: '07' },
  { code: '0710', name: '生物科学类', categoryCode: '07' },
  { code: '0711', name: '心理学类', categoryCode: '07' },
  { code: '0712', name: '统计学类', categoryCode: '07' },
  // 08 工学 (31)
  { code: '0801', name: '力学类', categoryCode: '08' },
  { code: '0802', name: '机械类', categoryCode: '08' },
  { code: '0803', name: '仪器类', categoryCode: '08' },
  { code: '0804', name: '材料类', categoryCode: '08' },
  { code: '0805', name: '能源动力类', categoryCode: '08' },
  { code: '0806', name: '电气类', categoryCode: '08' },
  { code: '0807', name: '电子信息类', categoryCode: '08' },
  { code: '0808', name: '自动化类', categoryCode: '08' },
  { code: '0809', name: '计算机类', categoryCode: '08' },
  { code: '0810', name: '土木类', categoryCode: '08' },
  { code: '0811', name: '水利类', categoryCode: '08' },
  { code: '0812', name: '测绘类', categoryCode: '08' },
  { code: '0813', name: '化工与制药类', categoryCode: '08' },
  { code: '0814', name: '地质类', categoryCode: '08' },
  { code: '0815', name: '矿业类', categoryCode: '08' },
  { code: '0816', name: '纺织类', categoryCode: '08' },
  { code: '0817', name: '轻工类', categoryCode: '08' },
  { code: '0818', name: '交通运输类', categoryCode: '08' },
  { code: '0819', name: '海洋工程类', categoryCode: '08' },
  { code: '0820', name: '航空航天类', categoryCode: '08' },
  { code: '0821', name: '兵器类', categoryCode: '08' },
  { code: '0822', name: '核工程类', categoryCode: '08' },
  { code: '0823', name: '农业工程类', categoryCode: '08' },
  { code: '0824', name: '林业工程类', categoryCode: '08' },
  { code: '0825', name: '环境科学与工程类', categoryCode: '08' },
  { code: '0826', name: '生物医学工程类', categoryCode: '08' },
  { code: '0827', name: '食品科学与工程类', categoryCode: '08' },
  { code: '0828', name: '建筑类', categoryCode: '08' },
  { code: '0829', name: '安全科学与工程类', categoryCode: '08' },
  { code: '0830', name: '生物工程类', categoryCode: '08' },
  { code: '0831', name: '公安技术类', categoryCode: '08' },
  // 09 农学 (7)
  { code: '0901', name: '植物生产类', categoryCode: '09' },
  { code: '0902', name: '自然保护与环境生态类', categoryCode: '09' },
  { code: '0903', name: '动物生产类', categoryCode: '09' },
  { code: '0904', name: '动物医学类', categoryCode: '09' },
  { code: '0905', name: '林学类', categoryCode: '09' },
  { code: '0906', name: '水产类', categoryCode: '09' },
  { code: '0907', name: '草学类', categoryCode: '09' },
  // 10 医学 (11)
  { code: '1001', name: '基础医学类', categoryCode: '10' },
  { code: '1002', name: '临床医学类', categoryCode: '10' },
  { code: '1003', name: '口腔医学类', categoryCode: '10' },
  { code: '1004', name: '公共卫生与预防医学类', categoryCode: '10' },
  { code: '1005', name: '中医学类', categoryCode: '10' },
  { code: '1006', name: '中西医结合类', categoryCode: '10' },
  { code: '1007', name: '药学类', categoryCode: '10' },
  { code: '1008', name: '中药学类', categoryCode: '10' },
  { code: '1009', name: '法医学类', categoryCode: '10' },
  { code: '1010', name: '医学技术类', categoryCode: '10' },
  { code: '1011', name: '护理学类', categoryCode: '10' },
  // 11 军事学 — 不在普通本科招生目录
  // 12 管理学 (9)
  { code: '1201', name: '管理科学与工程类', categoryCode: '12' },
  { code: '1202', name: '工商管理类', categoryCode: '12' },
  { code: '1203', name: '农业经济管理类', categoryCode: '12' },
  { code: '1204', name: '公共管理类', categoryCode: '12' },
  { code: '1205', name: '图书情报与档案管理类', categoryCode: '12' },
  { code: '1206', name: '物流管理与工程类', categoryCode: '12' },
  { code: '1207', name: '工业工程类', categoryCode: '12' },
  { code: '1208', name: '电子商务类', categoryCode: '12' },
  { code: '1209', name: '旅游管理类', categoryCode: '12' },
  // 13 艺术学 (5)
  { code: '1301', name: '艺术学理论类', categoryCode: '13' },
  { code: '1302', name: '音乐与舞蹈学类', categoryCode: '13' },
  { code: '1303', name: '戏剧与影视学类', categoryCode: '13' },
  { code: '1304', name: '美术学类', categoryCode: '13' },
  { code: '1305', name: '设计学类', categoryCode: '13' },
];
