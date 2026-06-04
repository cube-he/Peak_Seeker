/* 批次推荐页用的全部 mapping 字典 (§8 枚举 + 段排序 + 提交错误 + helpers).
   设计稿: WillNest Design System / teacher/batch-data.js 里的字典. */
import type { BatchRecommendation, ReferenceItem, ScoreInfo } from '@/services/batch-recommendations-api';

export const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_LIBERAL: '文科综合',
  COMPREHENSIVE_SCIENCE: '理科综合',
};

export type VerdictTone = 'safe' | 'accent' | 'rush' | 'pending';
export const VERDICT_INFO: Record<string, { txt: string; tone: VerdictTone }> = {
  ELIGIBLE:     { txt: '资格通过',  tone: 'safe'    },
  CONDITIONAL:  { txt: '条件通过',  tone: 'accent'  },
  INELIGIBLE:   { txt: '资格不符',  tone: 'rush'    },
  DATA_PENDING: { txt: '规则待完善', tone: 'pending' },
};

export type PassTone = 'safe' | 'rush' | 'accent' | 'soft';
export const PASS_INFO: Record<string, { icon: string; tone: PassTone }> = {
  PASS:      { icon: '✓', tone: 'safe'   },
  FAIL:      { icon: '✕', tone: 'rush'   },
  UNCERTAIN: { icon: '?', tone: 'accent' },
  SOFT_HINT: { icon: 'i', tone: 'soft'   }, // 蓝, 区别于 FAIL 红 (D4)
};

export const VOL_MODE_LABEL: Record<string, string> = {
  parallel: '平行志愿',
  sequential: '顺序志愿',
  mixed: '混合志愿',
  // 后端有时大写, 兼容
  PARALLEL: '平行志愿',
  SEQUENTIAL: '顺序志愿',
  MIXED: '混合志愿',
};

export const LINE_LABEL: Record<string, string> = {
  BATCH_LINE: '本科线',
  SPECIAL_LINE: '特殊类型线',
  ZHUANKE_LINE: '专科线',
};

export const REF_ICON_TEXT: Record<string, string> = {
  pdf: 'PDF', xlsx: 'XLS', doc: 'DOC', announcement: 'WEB',
};
export const REF_ICON_TONE: Record<string, string> = {
  pdf: 'pdf', xlsx: 'xlsx', doc: 'doc', announcement: 'web',
};

// 段内按 verdict 排序 (符合段: ELIGIBLE→CONDITIONAL→DATA_PENDING)
export const VERDICT_ORDER: Record<string, number> = {
  ELIGIBLE: 0, CONDITIONAL: 1, DATA_PENDING: 2, INELIGIBLE: 3,
};

// 一句话摘要 (§7.7 卡片 collapsed 态)
export interface BrSummary { tone: '' | 'safe' | 'rush' | 'accent'; text: string }
export function summarizeBatch(b: BatchRecommendation): BrSummary {
  const allRules = (b.subsetResults ?? []).flatMap(s => s.rulesEval ?? []);
  if (b.verdict === 'INELIGIBLE') {
    const fail = allRules.find(r => r.pass === 'FAIL');
    if (fail) return { tone: 'rush', text: `${fail.requirement} → ${fail.actual}` };
    const hard = (b.reasons ?? []).find(r => r.type === 'HARD_FAIL');
    if (hard) return { tone: 'rush', text: hard.message };
    return { tone: 'rush', text: '硬性资格未满足 (展开看详情)' };
  }
  if (b.verdict === 'CONDITIONAL') {
    const soft = allRules.find(r => r.pass === 'UNCERTAIN' || r.pass === 'SOFT_HINT');
    if (soft) return { tone: 'accent', text: `待核实: ${soft.requirement}` };
    return { tone: 'accent', text: '部分条件需老师核实' };
  }
  if (b.verdict === 'DATA_PENDING') {
    return { tone: '', text: '规则待完善 — 展开看子类别详情' };
  }
  // ELIGIBLE
  const si = b.scoreInfo;
  if (si && si.gap != null && !si.lineMissing && si.studentScore != null && si.lineScore != null) {
    const sign = si.gap >= 0 ? '+' : '';
    return { tone: 'safe', text: `${sign}${si.gap} 分 (你 ${si.studentScore} / 线 ${si.lineScore})` };
  }
  return { tone: 'safe', text: '资格通过' };
}

// 分数行配色 (§7.8.A)
export function scoreToneClass(si: ScoreInfo): 's-muted' | 's-safe' | 's-info' | 's-warn' | 's-rush' {
  if (si.lineMissing) return 's-muted';
  if (si.studentScore == null || si.lineScore == null) return 's-muted';
  if (si.gap == null) return 's-muted';
  if (si.gap >= 30) return 's-safe';
  if (si.gap >= 0) return 's-info';
  if (si.withinLeniency) return 's-warn';
  return 's-rush';
}

// 文件预览 URL (§7.9): pdf 用原 URL; doc/xlsx 用同名 .preview.pdf
export function previewUrlFor(ref: ReferenceItem): string | null {
  if (!ref.downloadUrl) return null;
  if (ref.type === 'pdf' || ref.type === 'announcement') return ref.downloadUrl;
  return ref.downloadUrl.replace(/\.(docx?|xlsx?|pptx?)$/i, '.preview.pdf');
}

// ISO → 本地时间串 "YYYY-MM-DD HH:mm"
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}
