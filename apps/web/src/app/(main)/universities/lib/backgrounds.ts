/**
 * 院校背景 tag — 用户产品规则给出的 24 个标签:
 * - 部委直属系(原 X 部直属):卫生 / 电力 / 铁道 / 冶金 / 化工 / 邮电 / 农业 /
 *   林业 / 中医药 / 轻工业 + 部委直属(meta)
 * - 拔尖计划:基础学科拔尖
 * - 卓越计划:卓越医生 / 法律 / 农林 / 工程师 / 中医 / 教师
 * - 院校联盟:C9 联盟 / 五院四系 / 两电一邮 / 中坚九校 / 电气四虎 / 建筑老八校
 *
 * 数据存储:复用 University.tags(JSON 数组) — 之后后端通过 import 工具补这些标签
 * 进去。前端拿 university.tags 做匹配:出现在 BACKGROUND_TAGS 中的 tag 就显示为
 * "院校背景"chip。
 */
export const BACKGROUND_TAGS: readonly string[] = [
  // 部委直属系
  '原卫生部直属',
  '原电力部直属',
  '原铁道部直属',
  '原冶金部直属',
  '原化工部直属',
  '原邮电部直属',
  '原农业部直属',
  '原林业部直属',
  '原中医药管理局',
  '原轻工业部直属',
  '部委直属',
  // 拔尖计划
  '基础学科拔尖',
  // 卓越计划
  '卓越医生',
  '卓越法律',
  '卓越农林',
  '卓越工程师',
  '卓越中医',
  '卓越教师',
  // 院校联盟
  'C9联盟',
  '五院四系',
  '两电一邮',
  '中坚九校',
  '电气四虎',
  '建筑老八校',
] as const;

const BACKGROUND_SET = new Set(BACKGROUND_TAGS);

/** 从 university.tags 数组里挑出属于"院校背景"分类的 tag */
export function pickBackgroundTags(tags: string[] | null | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags.filter((t) => BACKGROUND_SET.has(t));
}
