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
