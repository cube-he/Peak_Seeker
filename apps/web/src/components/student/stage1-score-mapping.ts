/**
 * Stage 1 9 科分数 ↔ 后端槽位字段翻译层
 *
 * 后端期望字段：examType / firstChoice / reChoices / scoreFirstChoice / scoreSub1 / scoreSub2
 * 前端展示字段：scorePhysics / scoreHistory / scoreChemistry / scoreBiology / scorePolitics / scoreGeography
 *
 * 翻译规则：
 * - 物理/历史 互斥（同时只能有一个有值），决定 examType + firstChoice + scoreFirstChoice
 * - 化生政地 选 2，按固定枚举顺序 化→生→政→地 映射到 reChoices / scoreSub1 / scoreSub2
 * - 总分 = 6 个有值科目分数累加（裸分）
 */

export interface Subject9Form {
  scoreChinese?: number;
  scoreMath?: number;
  scoreEnglish?: number;
  scorePhysics?: number;
  scoreHistory?: number;
  scoreChemistry?: number;
  scoreBiology?: number;
  scorePolitics?: number;
  scoreGeography?: number;
}

const RE_SUBJECTS_ORDER = ['化学', '生物', '政治', '地理'] as const;
type ReSubject = (typeof RE_SUBJECTS_ORDER)[number];

const RE_KEY_MAP: Record<ReSubject, keyof Subject9Form> = {
  化学: 'scoreChemistry',
  生物: 'scoreBiology',
  政治: 'scorePolitics',
  地理: 'scoreGeography',
};

/** 后端 profile → 9 科表单（回填）。返回 undefined 字段不写入对象。 */
export function to9Subjects(profile: Record<string, any>): Subject9Form {
  const out: Subject9Form = {};
  if (profile.scoreChinese != null) out.scoreChinese = profile.scoreChinese;
  if (profile.scoreMath != null) out.scoreMath = profile.scoreMath;
  if (profile.scoreEnglish != null) out.scoreEnglish = profile.scoreEnglish;

  // 首选：根据 firstChoice 字符串决定回填到 物理 还是 历史 格
  if (profile.firstChoice === '物理' && profile.scoreFirstChoice != null) {
    out.scorePhysics = profile.scoreFirstChoice;
  }
  if (profile.firstChoice === '历史' && profile.scoreFirstChoice != null) {
    out.scoreHistory = profile.scoreFirstChoice;
  }

  // 再选：reChoices[0]/[1] 名称对应 sub1/sub2 分数
  const reChoices: unknown = profile.reChoices;
  if (Array.isArray(reChoices)) {
    if (typeof reChoices[0] === 'string' && reChoices[0] in RE_KEY_MAP && profile.scoreSub1 != null) {
      out[RE_KEY_MAP[reChoices[0] as ReSubject]] = profile.scoreSub1;
    }
    if (typeof reChoices[1] === 'string' && reChoices[1] in RE_KEY_MAP && profile.scoreSub2 != null) {
      out[RE_KEY_MAP[reChoices[1] as ReSubject]] = profile.scoreSub2;
    }
  }
  return out;
}

/** 9 科表单 → 6 科裸分总分（未填的科目按 0 计；物理/历史互斥时取已填那个）。 */
export function sum9Subjects(form: Subject9Form): number {
  const reChoices = RE_SUBJECTS_ORDER.filter(
    (s) => form[RE_KEY_MAP[s]] != null,
  );
  return (
    (form.scoreChinese ?? 0) +
    (form.scoreMath ?? 0) +
    (form.scoreEnglish ?? 0) +
    (form.scorePhysics ?? form.scoreHistory ?? 0) +
    reChoices.reduce((s, k) => s + (form[RE_KEY_MAP[k]] ?? 0), 0)
  );
}

/** 9 科表单 → 后端 DTO 子集（提交时翻译）。要求 6 门已凑齐。 */
export function from9Subjects(form: Subject9Form): {
  examType: 'PHYSICS' | 'HISTORY';
  firstChoice: '物理' | '历史';
  scoreFirstChoice: number | undefined;
  reChoices: string[];
  scoreSub1: number | undefined;
  scoreSub2: number | undefined;
  scoreChinese: number | undefined;
  scoreMath: number | undefined;
  scoreEnglish: number | undefined;
  totalScore: number;
} {
  const isPhysics = form.scorePhysics != null;
  const reChoices = RE_SUBJECTS_ORDER.filter(
    (s) => form[RE_KEY_MAP[s]] != null,
  );
  const total = sum9Subjects(form);
  return {
    examType: isPhysics ? 'PHYSICS' : 'HISTORY',
    firstChoice: isPhysics ? '物理' : '历史',
    scoreFirstChoice: isPhysics ? form.scorePhysics : form.scoreHistory,
    reChoices: [...reChoices],
    scoreSub1: reChoices[0] ? form[RE_KEY_MAP[reChoices[0]]] : undefined,
    scoreSub2: reChoices[1] ? form[RE_KEY_MAP[reChoices[1]]] : undefined,
    scoreChinese: form.scoreChinese,
    scoreMath: form.scoreMath,
    scoreEnglish: form.scoreEnglish,
    totalScore: total,
  };
}

/** 6 门齐全校验。通过返回 null，否则返回错误文案。 */
export function validate6Subjects(form: Subject9Form): string | null {
  if (form.scoreChinese == null || form.scoreMath == null || form.scoreEnglish == null) {
    return '请填写语文、数学、英语成绩';
  }
  const hasPhysics = form.scorePhysics != null;
  const hasHistory = form.scoreHistory != null;
  if (hasPhysics && hasHistory) return '物理和历史只能填一门';
  if (!hasPhysics && !hasHistory) return '请填写物理或历史的成绩（首选科目）';

  const reCount = RE_SUBJECTS_ORDER.filter((s) => form[RE_KEY_MAP[s]] != null).length;
  if (reCount !== 2) return '再选科目需填写 2 门（化/生/政/地）';

  return null;
}
