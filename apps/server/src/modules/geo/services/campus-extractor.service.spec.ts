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

describe('CampusExtractor — strips leading modifiers from "X 学年/年级在 Y 校区"', () => {
  // 2026-06-02 真实脏数据回归:招生备注里"第一学年在江阴校区"这种句式,
  // 旧版 SUFFIX_RE 贪婪抓 "第一学年在江阴" 整串当校区名。修复:剥离前置
  // "X 学年/年级 起/在/开始" 修饰词,只取真校区名。

  it.each([
    ['第一学年在江阴校区就读', '江阴'],
    ['第二、三、四学年在南京校区就读', '南京'],
    ['一、二年级白马校区', '白马'],
    ['三年级起新庄校区', '新庄'],
    ['一年级在启东校区就读', '启东'],
    ['二年级开始在啬园校区就读', '啬园'],
    ['第一学年在朝晖校区就读', '朝晖'],
    ['第二学年起在莫干山校区就读', '莫干山'],
    ['第一学年在下沙校区', '下沙'],
    ['新生第一年在奉贤校区', '奉贤'],
    ['低年级在涿州校区', '涿州'],
    ['一至三年级在沙河校区', '沙河'],
    ['四学年在南京校区', '南京'],
  ])('「%s」→「%s」', async (notes, expected) => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: notes }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    const names = result.map((c) => c.name);
    expect(names).toContain(expected);
    // 不应再有任何含「年/学/级/起/在」字样的脏校区名
    for (const n of names) {
      expect(n).not.toMatch(/[年学级起在开始至]/);
    }
  });

  it('剥离学校名自身前缀:"中国药科大学江宁" → "江宁"', async () => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: '在中国药科大学江宁校区就读' }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    expect(result.map((c) => c.name)).toContain('江宁');
  });

  it('剥离学校名自身前缀:"山东大学威海" → "威海"', async () => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: '在山东大学威海校区上课' }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    expect(result.map((c) => c.name)).toContain('威海');
  });

  // 2026-06-02 task 5 边角修复:大X 前缀 + 黑名单词
  it.each([
    ['大三在靖安墨轩湖校区', '墨轩湖'],   // 太长会失败,但起码不是"大三在..."
    ['大四在南昌黄家湖校区', '黄家湖'],
    ['大一大二在郑蒲港校区', '郑蒲港'],
  ])('「%s」剥"大X"前缀 → 包含「%s」', async (notes, expected) => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: notes }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    expect(result.map((c) => c.name).join(',')).toContain(expected);
    // 不应残留"大X在"
    for (const c of result) {
      expect(c.name).not.toMatch(/^大[一二三四五六七八九十]/);
      expect(c.name).not.toMatch(/^在/);
    }
  });

  it.each([
    ['含政策性加分'],
    ['修读课程要求'],
    ['主校区'],         // 跟"本部"重复 + 没具体地名
    ['明秀或相思湖'],   // 含"或"
    ['或石林'],         // 起首"或"
    ['学籍管理办法'],
  ])('黑名单关键词「%s」→ 不入候选', async (notes) => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: notes + '校区' }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    for (const c of result) {
      expect(c.name).not.toContain('含政策性加分');
      expect(c.name).not.toContain('修读');
      expect(c.name).not.toContain('或');
      expect(c.name).not.toContain('学籍');
      expect(c.name).not.toBe('主校区');
    }
  });

  it('已正常的校区名不受影响:"江安校区就读" → "江安"', async () => {
    const prisma = fakePrisma([{ majorName: '某专业', planNotes: '江安校区就读' }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    expect(result.map((c) => c.name)).toEqual(['江安']);
  });

  it('括号格式仍然工作:"[威海]" → "威海"(没有副作用)', async () => {
    const prisma = fakePrisma([{ majorName: '[威海]计算机' }]);
    const ex = new CampusExtractor(prisma as any, fakeAmap() as any);
    const result = await ex.extractFromEnrollmentPlanTags(1);
    expect(result.map((c) => c.name)).toEqual(['威海']);
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

describe('CampusExtractor.extractFromManualList', () => {
  // 2026-06-02:手工映射表,补招生数据完全没线索的真分校(川大华西、哈工大威海/深圳、
  // 山大威海/青岛 等)。来源 = 'manual',优先级最高。

  it('未知 universityId → 空数组', () => {
    const ex = new CampusExtractor(fakePrisma([]) as any, fakeAmap() as any);
    expect(ex.extractFromManualList(999999)).toEqual([]);
  });

  it('已知 universityId → 返回该校所有 manual candidates,source=manual', () => {
    const ex = new CampusExtractor(fakePrisma([]) as any, fakeAmap() as any);
    // 9002 川大:望江(主) + 江安 + 华西(华西是数据源完全没线索的,manual 补)
    const result = ex.extractFromManualList(9002);
    expect(result.length).toBeGreaterThan(0);
    expect(result.map((c) => c.name)).toContain('华西');
    for (const c of result) {
      expect(c.source).toBe('manual');
    }
  });

  it('哈工大威海/深圳通过 manual 补', () => {
    const ex = new CampusExtractor(fakePrisma([]) as any, fakeAmap() as any);
    const result = ex.extractFromManualList(9055);
    const names = result.map((c) => c.name);
    expect(names).toContain('威海');
    expect(names).toContain('深圳');
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
