import { CampusExtractor } from './campus-extractor.service';

const fakePrisma = (rows: Array<{ majorName: string; planNotes?: string | null }>) => ({
  enrollmentPlan: {
    findMany: jest.fn().mockResolvedValue(rows),
  },
  university: {
    findUnique: jest.fn().mockResolvedValue({ id: 1, name: '哈尔滨工业大学' }),
  },
});
const fakeAmap = () => ({ searchPlaceText: jest.fn().mockResolvedValue([]) });

describe('CampusExtractor.extractFromEnrollmentPlanTags', () => {
  it('finds campus names from bracket tags in majorName', async () => {
    const prisma = fakePrisma([
      { majorName: '[威海]计算机科学与技术' },
      { majorName: '（深圳）软件工程' },
      { majorName: '电气工程及其自动化', planNotes: '沙河校区·限招' },
      { majorName: '电气工程及其自动化', planNotes: null },
      { majorName: '[威海]通信工程' },                  // duplicate name -> deduplicated
    ]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    const names = result.map((c) => c.name).sort();
    expect(names).toEqual(['威海', '沙河', '深圳']);
    for (const c of result) {
      expect(c.source).toBe('enrollment_plan_tag');
    }
  });

  it('returns empty list when nothing matches', async () => {
    const prisma = fakePrisma([
      { majorName: '机械工程', planNotes: null },
      { majorName: '材料科学与工程', planNotes: null },
    ]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    expect(await ex.extractFromEnrollmentPlanTags(1)).toEqual([]);
  });
});

describe('CampusExtractor.extractFromCharterText', () => {
  it('extracts campus names from "我校现有 X 个校区,分别位于…"', () => {
    const ex = new CampusExtractor(fakePrisma([]) as any, fakeAmap() as any);
    const text =
      '我校现有 3 个校区，分别位于哈尔滨、威海和深圳，本科生主要在校本部学习。';
    const result = ex.extractFromCharterText(text);
    const names = result.map((c) => c.name).sort();
    expect(names).toContain('威海');
    expect(names).toContain('深圳');
    for (const c of result) {
      expect(c.source).toBe('charter_extract');
    }
  });

  it('returns [] when text has no recognised pattern', () => {
    const ex = new CampusExtractor(fakePrisma([]) as any, fakeAmap() as any);
    expect(ex.extractFromCharterText('随便一段文字')).toEqual([]);
  });
});

describe('CampusExtractor.extract (combined)', () => {
  it('combines and dedups across sources, preserving best source ordering', async () => {
    const prisma = {
      enrollmentPlan: { findMany: jest.fn().mockResolvedValue([
        { majorName: '[威海]软件', planNotes: null },
      ])},
      university: { findUnique: jest.fn().mockResolvedValue({
        id: 1, name: '哈尔滨工业大学',
        charterInfo: { fullText: '我校现有威海校区和深圳校区。' },
      })},
    };
    const amap = { searchPlaceText: jest.fn() };
    const ex = new CampusExtractor(prisma as any, amap as any);

    const result = await ex.extract(1);
    const names = result.map((c) => c.name).sort();
    // 威海 found by both sources -> dedup; 深圳 found by charter
    expect(names).toEqual(['威海', '深圳']);
    const wei = result.find((c) => c.name === '威海')!;
    expect(wei.source).toBe('enrollment_plan_tag'); // preferred (higher confidence)
  });
});
