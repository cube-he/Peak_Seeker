/**
 * 院校名匹配 util — 供 import-university-*.ts 共用。
 *
 * 匹配优先级：matchByCode（code 严格相等） > matchByName（规范化后相等）。
 * normalizeUniversityName 去括号内容 + 去空格,与 import-soft-rankings.ts 一致。
 */

export function normalizeUniversityName(name: string): string {
  return name.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

export class UniversityMatcher {
  private byCode = new Map<string, number[]>();
  private byName = new Map<string, number[]>();
  private _unmatchedCount = 0;
  private _unmatchedSamples: string[] = [];

  static async fromDb(prisma: {
    university: { findMany: (args?: any) => Promise<Array<{ id: number; name: string; code: string | null }>> };
  }): Promise<UniversityMatcher> {
    const m = new UniversityMatcher();
    const rows = await prisma.university.findMany({
      select: { id: true, name: true, code: true } as any,
    });
    for (const u of rows) {
      if (u.code) {
        const arr = m.byCode.get(u.code) ?? [];
        arr.push(u.id);
        m.byCode.set(u.code, arr);
      }
      const nameKey = normalizeUniversityName(u.name);
      const arr = m.byName.get(nameKey) ?? [];
      arr.push(u.id);
      m.byName.set(nameKey, arr);
    }
    return m;
  }

  matchByCode(code: string): number[] | null {
    if (!code) return null;
    return this.byCode.get(String(code).trim()) ?? null;
  }

  matchByName(name: string): number[] | null {
    if (!name) return null;
    const ids = this.byName.get(normalizeUniversityName(name)) ?? null;
    if (!ids) {
      this._unmatchedCount++;
      if (this._unmatchedSamples.length < 20) this._unmatchedSamples.push(name);
    }
    return ids;
  }

  reportUnmatched(): { totalUnmatched: number; sampleNames: string[] } {
    return { totalUnmatched: this._unmatchedCount, sampleNames: [...this._unmatchedSamples] };
  }
}
