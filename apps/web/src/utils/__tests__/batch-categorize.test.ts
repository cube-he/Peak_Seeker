import { categorizeBatch, BATCH_CATEGORIES, type BatchCategory } from '../batch-categorize';

describe('categorizeBatch', () => {
  it('归"本科一批*" 为 "本科批"', () => {
    expect(categorizeBatch('本科一批 B段')).toBe('本科批');
    expect(categorizeBatch('本科一批 A段')).toBe('本科批');
    expect(categorizeBatch('本科一批(高校专项)')).toBe('本科批');
    expect(categorizeBatch('本科一批(地方专项)')).toBe('本科批');
    expect(categorizeBatch('本科一批(乡村振兴重点发展专项)')).toBe('本科批');
  });

  it('归"本科提前批*" 为 "提前批"', () => {
    expect(categorizeBatch('本科提前批 A段')).toBe('提前批');
    expect(categorizeBatch('本科提前批 B段')).toBe('提前批');
    expect(categorizeBatch('本科提前批(军队专项)')).toBe('提前批');
  });

  it('归"高职*" 为 "高职专科"', () => {
    expect(categorizeBatch('高职(专科)批')).toBe('高职专科');
    expect(categorizeBatch('高职(专科)提前批')).toBe('高职专科');
  });

  it('返回 null 对空字符串或不识别 batch', () => {
    expect(categorizeBatch('')).toBeNull();
    expect(categorizeBatch('随便写的批次')).toBeNull();
  });

  it('BATCH_CATEGORIES 包含 3 个固定类别', () => {
    expect(BATCH_CATEGORIES).toEqual(['本科批', '提前批', '高职专科']);
  });
});
