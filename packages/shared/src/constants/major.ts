// 专业大类常量（教育部学科门类）
export const MAJOR_CATEGORIES = [
  { code: '01', name: '哲学' },
  { code: '02', name: '经济学' },
  { code: '03', name: '法学' },
  { code: '04', name: '教育学' },
  { code: '05', name: '文学' },
  { code: '06', name: '历史学' },
  { code: '07', name: '理学' },
  { code: '08', name: '工学' },
  { code: '09', name: '农学' },
  { code: '10', name: '医学' },
  { code: '11', name: '军事学' },
  { code: '12', name: '管理学' },
  { code: '13', name: '艺术学' },
  { code: '14', name: '交叉学科' },
] as const;

// 热门专业类别
export const HOT_MAJOR_CATEGORIES = [
  '计算机类',
  '电子信息类',
  '人工智能',
  '软件工程',
  '数据科学与大数据技术',
  '金融学类',
  '临床医学',
  '口腔医学',
  '法学',
  '会计学',
] as const;

// 专业层次
export const MAJOR_LEVELS = [
  { value: '本科', label: '本科' },
  { value: '专科', label: '专科' },
] as const;
