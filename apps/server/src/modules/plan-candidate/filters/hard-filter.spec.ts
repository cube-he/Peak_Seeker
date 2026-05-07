// hard-filter.spec.ts
import { buildHardFilterWhere } from './hard-filter';

describe('buildHardFilterWhere', () => {
  it('生成包含 year/province/batch/subjects 的 Prisma where', () => {
    const where = buildHardFilterWhere({
      year: 2026, province: '四川', batchName: '本科批A段', subjects: '物理',
    });
    expect(where.year).toBe(2026);
    expect(where.province).toBe('四川');
    expect(where.batch).toBe('本科批A段');
    expect(where.subjects).toBe('物理');
  });

  it('keyword 加 OR 模糊匹配', () => {
    const where = buildHardFilterWhere({
      year: 2026, province: '四川', batchName: '本科批A段', subjects: '物理',
      keyword: '川大',
    });
    expect(where.OR).toBeDefined();
    expect((where.OR as any[]).length).toBeGreaterThan(0);
  });

  it('keyword 为空时不加 OR', () => {
    const where = buildHardFilterWhere({
      year: 2026, province: '四川', batchName: '本科批A段', subjects: '物理', keyword: '',
    });
    expect(where.OR).toBeUndefined();
  });
});
