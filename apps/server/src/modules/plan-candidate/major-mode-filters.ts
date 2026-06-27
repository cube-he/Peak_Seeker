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
    // 库里无"独立学院"(已全国转设); running_nature 的"独立"类只有"境外高校独立办学"。
    // 故 independent 实际筛的是境外办学(前端 chip 标签同步改为"境外办学")。用"境外"精确匹配。
    if (nature === 'independent') return rn.includes('境外');
    return true;
  });
}

/**
 * 院校标签 (985/211/双一流) 多选 OR 语义 (985 或 211 或 双一流 任一即过).
 * 用户心智模型: 勾"985+双一流"=想看任一名校, 不是必须同时挂两标签.
 * AND 会砍掉非 985 的双一流 (如河南大学/宁夏大学), 与"勾越多看越多"直觉相反.
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
    return tags.some((t) => {
      if (t === '985') return !!u?.is985;
      if (t === '211') return !!u?.is211;
      if (t === 'doubleFirstClass') return !!u?.isDoubleFirstClass;
      return false; // 未知 tag 不贡献命中
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

/** 全量池里有哪些院校所在省: distinct + 按出现组数降序(同数 localeCompare). 组数最多者居首。
 *  对标 collectRecruitTypes: 让"省份"chip 动态、完整, 不再前端写死(库里 32 省, 旧版只列 12)。 */
export function collectProvinces(groups: GroupWithUniversity[]): string[] {
  const counts = new Map<string, number>();
  for (const g of groups) {
    const p = String(g.university?.province ?? '').trim();
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p);
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

/**
 * 城市名归一: 去掉行政级别后缀再比, 让老师输入"成都市"也能命中库里的"成都",
 * "璧山区"="璧山"(库里两种写法都有)。
 * 直辖市(北京/重庆/上海/天津)库里存的是城区(如"海淀区"), 这里去后缀后是"海淀" —
 * 老师想筛整个直辖市应该用「省份」chip, 城市框只解决"同名 + 行政后缀"的错配。
 */
function normalizeCity(s: string): string {
  return s.replace(/(特别行政区|自治州|自治县|地区|市辖区|市|区|县|盟|州|旗)$/u, '');
}

/** 院校所在市 CSV. 空 csv=不过滤同引用返回; 院校 city 空 → 排除. 去后缀归一后比对(成都市=成都). */
export function filterGroupsByUniversityCities<T extends GroupWithUniversity>(
  groups: T[],
  csv?: string | null,
): T[] {
  const cs = parseCsv(csv);
  if (cs.length === 0) return groups;
  const allow = new Set(cs.map(normalizeCity));
  return groups.filter((g) => {
    const c = g.university?.city ?? '';
    return c ? allow.has(normalizeCity(c)) : false;
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
