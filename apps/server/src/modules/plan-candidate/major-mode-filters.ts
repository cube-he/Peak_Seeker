// 专业优先模式 (GROUP 视图) 7 项 chip 筛选, 服务端分页层应用.
// 对标 sino-foreign-filter / recruit-type-filter: 纯函数, 不碰 DB / 缓存键,
// 在 paginateCandidateGroups 入口 chain 调用. 同一批 cache 切不同 filter 不重建。
//
// 字段约定 (group 形状, 见 plan-candidate.service.ts 的 resultGroups 构造):
//   - g.university.runningNature: string | null    办学性质 (含 "公办/民办/中外合作/港澳/独立")
//   - g.university.is985 / is211 / isDoubleFirstClass: boolean
//   - g.university.universityBackground: string | null   '/' 分隔标签串, LIKE 模糊匹配
//   - g.university.province / city: string | null
//   - g.isNewMajor: boolean        组内任一 ep.isNew=true (装配时计算)
//   - g.isNewUniversity: boolean   该院校历史 N 年 (sourceYear-1..-3) 未在该省出现 (装配时计算)

/** CSV 拆分: 去空白去空项. */
function parseCsv(csv?: string | null): string[] {
  return (csv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type GroupWithUniversity = {
  university?: {
    runningNature?: string | null;
    is985?: boolean | null;
    is211?: boolean | null;
    isDoubleFirstClass?: boolean | null;
    universityBackground?: string | null;
    province?: string | null;
    city?: string | null;
  } | null;
};

/** 办学性质: 单选 (DTO 限 IsIn 枚举). 子串匹配 runningNature. 空=不过滤同引用返回. */
export function filterGroupsByNature<T extends GroupWithUniversity>(
  groups: T[],
  nature?: string | null,
): T[] {
  if (!nature) return groups;
  return groups.filter((g) => {
    const rn = g.university?.runningNature ?? '';
    if (nature === 'public') return rn.includes('公办');
    if (nature === 'private') return rn.includes('民办');
    if (nature === 'sinoForeign') return rn.includes('中外合作');
    if (nature === 'hkMacau') return rn.includes('港澳');
    if (nature === 'independent') return rn.includes('独立');
    return true;
  });
}

/**
 * 院校标签 (985/211/双一流) 多选 AND 语义.
 * 用户期望: "985,211" = 同时是 985 和 211, 不是 985 或 211.
 * 空 csv=不过滤同引用返回.
 */
export function filterGroupsByTags<T extends GroupWithUniversity>(
  groups: T[],
  csv?: string | null,
): T[] {
  const tags = parseCsv(csv);
  if (tags.length === 0) return groups;
  return groups.filter((g) => {
    const u = g.university;
    return tags.every((t) => {
      if (t === '985') return !!u?.is985;
      if (t === '211') return !!u?.is211;
      if (t === 'doubleFirstClass') return !!u?.isDoubleFirstClass;
      return true; // 未知 tag 视为通过, 不误杀
    });
  });
}

/**
 * 院校背景 (九校联盟/卓越大学联盟/国防七子/...) 多选 OR 语义.
 * P1 用 String LIKE 模糊匹配 universityBackground 字段 (用户拍板 Q1, schema 无独立标签表).
 * 空 csv=不过滤同引用返回; universityBackground 空字符串 → 任何 bg 都不命中.
 */
export function filterGroupsByBackgrounds<T extends GroupWithUniversity>(
  groups: T[],
  csv?: string | null,
): T[] {
  const bgs = parseCsv(csv);
  if (bgs.length === 0) return groups;
  return groups.filter((g) => {
    const ub = g.university?.universityBackground ?? '';
    if (!ub) return false;
    return bgs.some((bg) => ub.includes(bg));
  });
}

/** 院校所在省 CSV (university.province IN). 空 csv=不过滤同引用返回; 院校 province 空 → 排除. */
export function filterGroupsByUniversityProvinces<T extends GroupWithUniversity>(
  groups: T[],
  csv?: string | null,
): T[] {
  const ps = parseCsv(csv);
  if (ps.length === 0) return groups;
  const allow = new Set(ps);
  return groups.filter((g) => {
    const p = g.university?.province ?? '';
    return p ? allow.has(p) : false;
  });
}

/** 院校所在市 CSV (university.city IN). 空 csv=不过滤同引用返回; 院校 city 空 → 排除. */
export function filterGroupsByUniversityCities<T extends GroupWithUniversity>(
  groups: T[],
  csv?: string | null,
): T[] {
  const cs = parseCsv(csv);
  if (cs.length === 0) return groups;
  const allow = new Set(cs);
  return groups.filter((g) => {
    const c = g.university?.city ?? '';
    return c ? allow.has(c) : false;
  });
}

type GroupWithNewFlags = {
  isNewMajor?: boolean | null;
  isNewUniversity?: boolean | null;
};

/**
 * 新增院校 / 新增专业 单选.
 *   - major:      组内含 isNew=true 专业 (新设/扩列专业)
 *   - university: 该院校 sourceYear-1..-3 三年都未在川招生 (首次在川)
 *   - either:     任一即可
 * 空=不过滤同引用返回.
 *
 * isNewMajor / isNewUniversity 必须由装配方计算并挂到 group (本模块不查 DB).
 */
export function filterGroupsByIsNewItem<T extends GroupWithNewFlags>(
  groups: T[],
  isNewItem?: string | null,
): T[] {
  if (!isNewItem) return groups;
  return groups.filter((g) => {
    if (isNewItem === 'major') return !!g.isNewMajor;
    if (isNewItem === 'university') return !!g.isNewUniversity;
    if (isNewItem === 'either') return !!g.isNewMajor || !!g.isNewUniversity;
    return true;
  });
}
