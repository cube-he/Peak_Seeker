// 院校类型常量
export const UNIVERSITY_TYPES = [
  { value: '综合', label: '综合类' },
  { value: '理工', label: '理工类' },
  { value: '师范', label: '师范类' },
  { value: '农林', label: '农林类' },
  { value: '医药', label: '医药类' },
  { value: '财经', label: '财经类' },
  { value: '政法', label: '政法类' },
  { value: '语言', label: '语言类' },
  { value: '艺术', label: '艺术类' },
  { value: '体育', label: '体育类' },
  { value: '民族', label: '民族类' },
  { value: '军事', label: '军事类' },
] as const;

// 院校层次
export const UNIVERSITY_LEVELS = [
  { value: '本科', label: '本科' },
  { value: '专科', label: '专科' },
] as const;

// 办学性质
export const RUNNING_NATURES = [
  { value: '公办', label: '公办' },
  { value: '民办', label: '民办' },
  { value: '中外合作办学', label: '中外合作办学' },
] as const;

// 院校标签
export const UNIVERSITY_TAGS = [
  { value: '985', label: '985工程' },
  { value: '211', label: '211工程' },
  { value: '双一流', label: '双一流' },
  { value: '强基计划', label: '强基计划' },
  { value: '保研资格', label: '保研资格' },
] as const;

// 批次
export const BATCHES = [
  { value: '本科提前批', label: '本科提前批' },
  { value: '本科一批', label: '本科一批' },
  { value: '本科二批', label: '本科二批' },
  { value: '专科提前批', label: '专科提前批' },
  { value: '专科批', label: '专科批' },
] as const;
