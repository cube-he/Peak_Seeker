/**
 * 方案/批次配置口径的批次名 → enrollment_plans / admission_records 实际存储口径。
 *
 * 数据表实名来自招生计划主表与录取数据导入, 与 batchConfig 种子名存在三类错位
 * (2026-06-13 生产库实测):
 *   ① 专项后缀: 配置名「本科批A段（国家专项）」数据侧是 batch='本科批A段' + recruitType='国家专项计划'
 *   ② 全称/简称: 「高职批」数据侧是 '高职(专科)批'
 *   ③ 名称变体: 「省属高校少民预科」数据侧是 '本科批(省属高校少数民族预科)'
 * 不在映射表里的名字原样返回 (本科批B段 / 本科提前批A段 / 本科提前批B段 两侧一致)。
 */
export interface BatchQueryShape {
  /** enrollment_plans.batch 的候选值 (查询用 IN) */
  batches: string[];
  /** 需要时按 recruitType 收窄 (contains 匹配, 如 '国家专项' 命中 '国家专项计划') */
  recruitTypeContains?: string;
}

const ALIASES: Record<string, BatchQueryShape> = {
  '本科批A段（国家专项）': { batches: ['本科批A段'], recruitTypeContains: '国家专项' },
  '本科批A段（地方专项）': { batches: ['本科批A段'], recruitTypeContains: '地方专项' },
  '本科批高校专项': { batches: ['本科批(高校专项)'] },
  '本科批高水平运动队': { batches: ['本科批(高水平运动队)'] },
  '省属高校少民预科': { batches: ['本科批(省属高校少数民族预科)'] },
  '本科批区域教育均衡专项': { batches: ['本科批(区域教育均衡发展专项)'] },
  '高职批': { batches: ['高职(专科)批'] },
  '高职提前批': { batches: ['高职(专科)提前批'] },
  '本科提前批国家专项': { batches: ['本科提前批(国家专项)'] },
  '本科提前批高校专项': { batches: ['本科提前批(高校专项)'] },
};

// 半角括号变体兜底 (历史数据/手输入可能用半角)
for (const [key, shape] of Object.entries({ ...ALIASES })) {
  const halfWidth = key.replace(/（/g, '(').replace(/）/g, ')');
  if (halfWidth !== key && !ALIASES[halfWidth]) ALIASES[halfWidth] = shape;
}

export function resolveBatchQueryShape(batchName: string): BatchQueryShape {
  return ALIASES[batchName] ?? { batches: [batchName] };
}
