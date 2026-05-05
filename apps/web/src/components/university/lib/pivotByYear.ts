/**
 * GROUP BY (majorName + groupCode + recruitType + subjects) → 透视为按年份的二维结构。
 * 同名跨组/跨招生类型/跨选科组合不合并（与 7 字段自然主键策略一致）。
 */

export interface RawYearRecord {
  year: number;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  [field: string]: any;
}

export interface PivotOptions<F extends string> {
  /** 每年要从原记录抽取哪些字段 */
  fields: F[];
  /** 取最近多少年（默认 3） */
  yearLimit?: number;
  /** 按"最新有数据年份"的哪个字段排序（默认不排序，保留原序） */
  sortByField?: F;
  /** 'asc'（默认）位次/分数低→高 */
  sortDirection?: 'asc' | 'desc';
}

export interface PivotRow<F extends string> {
  rowKey: string;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  byYear: Partial<Record<number, Partial<Record<F, number>>>>;
}

export interface PivotResult<F extends string> {
  rows: PivotRow<F>[];
  /** 降序，含数据的最近 N 年 */
  years: number[];
}

const buildRowKey = (r: RawYearRecord) =>
  `${r.majorName}||${r.groupCode}||${r.recruitType}||${r.subjects}`;

export function pivotByYear<R extends RawYearRecord, F extends string>(
  records: R[],
  options: PivotOptions<F>,
): PivotResult<F> {
  const { fields, yearLimit = 3, sortByField, sortDirection = 'asc' } = options;

  if (records.length === 0) return { rows: [], years: [] };

  // 取最近 yearLimit 年
  const allYears = Array.from(new Set(records.map((r) => r.year))).sort((a, b) => b - a);
  const years = allYears.slice(0, yearLimit);
  const yearSet = new Set(years);

  // GROUP BY 行键
  const map = new Map<string, PivotRow<F>>();
  for (const r of records) {
    if (!yearSet.has(r.year)) continue;
    const key = buildRowKey(r);
    let row = map.get(key);
    if (!row) {
      row = {
        rowKey: key,
        majorName: r.majorName,
        groupCode: r.groupCode,
        recruitType: r.recruitType,
        subjects: r.subjects,
        majorId: r.majorId,
        byYear: {},
      };
      map.set(key, row);
    }
    const cell: Partial<Record<F, number>> = row.byYear[r.year] || {};
    for (const f of fields) {
      const v = r[f];
      if (typeof v === 'number') cell[f] = v;
    }
    row.byYear[r.year] = cell;
  }

  let rows = Array.from(map.values());

  // 排序：仅按最新年份的 sortByField 取值；缺最新年份数据的行排到末尾
  if (sortByField && years.length > 0) {
    const latestYear = years[0];
    const dir = sortDirection === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a.byYear[latestYear]?.[sortByField];
      const bv = b.byYear[latestYear]?.[sortByField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }

  return { rows, years };
}
