// 录取数据中实际存在的批次值（与 BATCHES 不同，这些来自实际数据）
export const ADMISSION_BATCHES = [
  { value: '本科批B段', label: '本科批B段' },
  { value: '本科批A段', label: '本科批A段' },
  { value: '本科提前批B段', label: '本科提前批B段' },
  { value: '本科提前批A段', label: '本科提前批A段' },
  { value: '本科批(高校专项)', label: '本科批(高校专项)' },
  { value: '高职(专科)批', label: '高职(专科)批' },
  { value: '高职(专科)提前批', label: '高职(专科)提前批' },
] as const;

// 科目（新高考 3+1+2 的首选科目）
export const ADMISSION_SUBJECTS = [
  { value: '物理', label: '物理类' },
  { value: '历史', label: '历史类' },
] as const;

// 招生类型（按数据量排序，分组展示）
export const RECRUIT_TYPES = [
  { value: '普通类本科', label: '普通类本科', group: '普通' },
  { value: '普通类高职(专科)', label: '普通类高职(专科)', group: '普通' },
  { value: '国家专项计划', label: '国家专项计划', group: '专项' },
  { value: '地方专项计划', label: '地方专项计划', group: '专项' },
  { value: '高校专项计划', label: '高校专项计划', group: '专项' },
  { value: '省级公费师范生', label: '省级公费师范生', group: '定向' },
  { value: '地方优师计划', label: '地方优师计划', group: '定向' },
  { value: '军事类', label: '军事类', group: '特殊' },
  { value: '公安类、司法类', label: '公安类、司法类', group: '特殊' },
] as const;
