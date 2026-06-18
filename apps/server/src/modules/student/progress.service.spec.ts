import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  const service = new ProgressService();

  describe('compute', () => {
    it('空档案：所有进度都是 0', () => {
      const r = service.compute({} as any);
      expect(r.studentSelfCompleteness).toBe(0);
      expect(r.teacherDataCompleteness).toBe(0);
      expect(r.overallCompleteness).toBe(0);
      expect(r.stageProgress.stage1.completed).toBe(false);
      expect(r.isRecommendable).toBe(false);
    });

    it('仅 stage1 完整：stage1.completed=true, stage2/3.completed=false', () => {
      const profile = {
        realName: '小王',
        phone: '13800000000',
        gender: 'MALE',
        examType: 'PHYSICS',
        examYear: 2026,
        parentPhone: '13900000000',
        formFiller: 'STUDENT',
        // 选科
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        // 分数
        totalScore: 600,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 140,
        scoreFirstChoice: 90,
        scoreSub1: 80,
        scoreSub2: 70,
      };
      const r = service.compute(profile as any);
      expect(r.stageProgress.stage1.completed).toBe(true);
      expect(r.stageProgress.stage2.completed).toBe(false);
      expect(r.stageProgress.stage3.completed).toBe(false);
      expect(r.studentSelfCompleteness).toBeGreaterThan(0);
      expect(r.studentSelfCompleteness).toBeLessThan(40);
      expect(r.isRecommendable).toBe(false);
    });

    it('teacher 字段全填 + stage1 完整：isRecommendable=true', () => {
      const profile = {
        realName: '小王',
        phone: '13800000000',
        gender: 'MALE',
        examType: 'PHYSICS',
        parentPhone: '13900000000',
        formFiller: 'STUDENT',
        // teacher fields
        totalScore: 600,
        provincialRank: 1000,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 140,
        scoreFirstChoice: 90,
        scoreSub1: 80,
        scoreSub2: 70,
        bonusPolicyStatus: 'NONE',
        bonusItems: [],
        province: '四川',
        city: '成都',
        county: '武侯区',
        isRural: false,
        examLocationProvince: '四川',
        examLocationCity: '成都',
        examLocationCounty: '武侯区',
      };
      const r = service.compute(profile as any);
      // 注：bonusItems=[] 视为未填（空数组），所以 teacherDataCompleteness 不到 100
      // 这条测试期望 teacherDataCompleteness < 100，但 isRecommendable 应该 false
      // 修正：用 bonusItems: [{ type: 'X', value: 5 }] 让数组非空
      expect(r.isRecommendable).toBe(false); // bonusItems 空数组判定为未填
    });

    it('teacher 字段全填（含非空 bonusItems）+ stage1：isRecommendable=true', () => {
      const profile = {
        // STAGE_1 全部 16 字段
        realName: '小王',
        phone: '13800000000',
        gender: 'MALE',
        examType: 'PHYSICS',
        examYear: 2026,
        parentPhone: '13900000000',
        formFiller: 'STUDENT',
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        totalScore: 600,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 140,
        scoreFirstChoice: 90,
        scoreSub1: 80,
        scoreSub2: 70,
        // ① TEACHER_ONLY 全部 10 字段
        provincialRank: 1000,
        bonusPolicyStatus: 'NONE',
        bonusItems: [{ type: 'minority', value: 5 }],
        province: '四川',
        city: '成都',
        county: '武侯区',
        isRural: false,
        examLocationProvince: '四川',
        examLocationCity: '成都',
        examLocationCounty: '武侯区',
        // ② 资格判定必填余项 + ③ 体检必填 (2026-06-10 三层全必填)
        birthDate: new Date('2008-01-01'),
        ethnicity: '汉族',
        height: 175,
        weight: 65,
        visionLeft: 4.8,
        visionRight: 4.8,
        colorBlind: false,
        colorWeak: false,
        // 意向专业(有效梯队) + 优先模式 (2026-06-10 追加必填)
        preferredMajors: [{ tier: 1, majors: ['计算机科学与技术'] }],
        priorityMode: 'MAJOR_FIRST',
        // 政治面貌 + 高考报名地 (2026-06-11 追加必填; examLocation* 上方已有)
        politicalStatus: 'LEAGUE_MEMBER',
      };
      const r = service.compute(profile as any);
      expect(r.teacherDataCompleteness).toBe(100);
      expect(r.isRecommendable).toBe(true);
    });

    it('手机号/家长手机号 二选一: 填其一即可推荐, 都空则两者都列入 missing', () => {
      const base = {
        realName: '小王', gender: 'MALE', examType: 'PHYSICS', examYear: 2026, formFiller: 'STUDENT',
        firstChoice: '物理', reChoices: ['化学', '生物'],
        totalScore: 600, scoreChinese: 120, scoreMath: 130, scoreEnglish: 140,
        scoreFirstChoice: 90, scoreSub1: 80, scoreSub2: 70,
        provincialRank: 1000, bonusPolicyStatus: 'NONE', bonusItems: [{ type: 'minority', value: 5 }],
        province: '四川', city: '成都', county: '武侯区', isRural: false,
        examLocationProvince: '四川', examLocationCity: '成都', examLocationCounty: '武侯区',
        birthDate: new Date('2008-01-01'), ethnicity: '汉族',
        height: 175, weight: 65, visionLeft: 4.8, visionRight: 4.8, colorBlind: false, colorWeak: false,
        preferredMajors: [{ tier: 1, majors: ['计算机科学与技术'] }], priorityMode: 'MAJOR_FIRST',
        politicalStatus: 'LEAGUE_MEMBER',
      };
      // 只填家长手机号(学生手机号空) → 联系方式已满足
      const onlyParent = service.compute({ ...base, parentPhone: '13900000000' } as any);
      expect(onlyParent.missingFieldsForRecommend).not.toContain('phone');
      expect(onlyParent.missingFieldsForRecommend).not.toContain('parentPhone');
      expect(onlyParent.isRecommendable).toBe(true);
      // 只填学生手机号(家长空) → 同样满足
      const onlyStudent = service.compute({ ...base, phone: '13800000000' } as any);
      expect(onlyStudent.isRecommendable).toBe(true);
      // 两者都空 → 都列入 missing, 不可推荐
      const neither = service.compute({ ...base } as any);
      expect(neither.missingFieldsForRecommend).toEqual(
        expect.arrayContaining(['phone', 'parentPhone']),
      );
      expect(neither.isRecommendable).toBe(false);
    });

    it('缺政治面貌/报名地/语数外成绩 → missing 列出 (2026-06-11 追加)', () => {
      const r = service.compute({} as any);
      for (const f of ['politicalStatus', 'examLocationProvince', 'examLocationCounty', 'scoreChinese', 'scoreMath', 'scoreEnglish', 'scoreFirstChoice', 'scoreSub1', 'scoreSub2']) {
        expect(r.missingFieldsForRecommend).toContain(f);
      }
    });

    it('preferredMajors 只有意向池(tier=0) → 视为未填; priorityMode 缺 → 列出', () => {
      const r = service.compute({
        preferredMajors: [{ tier: 0, majors: ['临床医学'] }],
      } as any);
      expect(r.missingFieldsForRecommend).toContain('preferredMajors');
      expect(r.missingFieldsForRecommend).toContain('priorityMode');
    });

    it('isRecommendable=false 时 missingFieldsForRecommend 列出缺什么', () => {
      const profile = {
        realName: '小王',
        phone: '13800000000',
        gender: 'MALE',
        examType: 'PHYSICS',
        parentPhone: '13900000000',
        formFiller: 'STUDENT',
        totalScore: 600,
      };
      const r = service.compute(profile as any);
      expect(r.isRecommendable).toBe(false);
      expect(r.missingFieldsForRecommend).toContain('provincialRank');
      expect(r.missingFieldsForRecommend).not.toContain('totalScore');
    });

    // 2026-06-10 业务定调: 资格判定字段 + 体检字段也是生成方案硬门槛
    it('缺户籍县/农村标志/出生日期/体检字段 → isRecommendable=false 并逐一列出', () => {
      const profile = {
        realName: '小王',
        phone: '13800000000',
        parentPhone: '13900000000',
        examType: 'PHYSICS',
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        totalScore: 600,
        provincialRank: 1000,
        gender: 'MALE',
        ethnicity: '汉族',
        province: '四川',
        city: '成都',
        bonusPolicyStatus: 'NONE',
        // 缺: county / isRural / birthDate / height / weight / vision*2 / color*2
      };
      const r = service.compute(profile as any);
      expect(r.isRecommendable).toBe(false);
      for (const f of ['county', 'isRural', 'birthDate', 'height', 'weight', 'visionLeft', 'visionRight', 'colorBlind', 'colorWeak']) {
        expect(r.missingFieldsForRecommend).toContain(f);
      }
      expect(r.missingFieldsForRecommend).not.toContain('province');
      expect(r.missingFieldsForRecommend).not.toContain('gender');
    });

    it('isRural=false / colorBlind=false 视为已填 (布尔 false 不是缺失)', () => {
      const r = service.compute({ isRural: false, colorBlind: false } as any);
      expect(r.missingFieldsForRecommend).not.toContain('isRural');
      expect(r.missingFieldsForRecommend).not.toContain('colorBlind');
    });

    it('数组字段空数组算未填', () => {
      const r = service.compute({
        preferredProvinces: [],
        preferredMajors: ['计算机'],
      } as any);
      expect(r.stageProgress.stage2.filled).toBe(1);
    });

    it('overallCompleteness = teacher×0.4 + student×0.6', () => {
      const profile = {
        realName: '小王',
        phone: '13800000000',
        gender: 'MALE',
        examType: 'PHYSICS',
        parentPhone: '13900000000',
        formFiller: 'STUDENT',
        totalScore: 600,
        provincialRank: 1000,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 140,
        scoreFirstChoice: 90,
        scoreSub1: 80,
        scoreSub2: 70,
        bonusPolicyStatus: 'NONE',
        bonusItems: [{ type: 'X', value: 5 }],
        province: '四川',
        city: '成都',
        county: '武侯区',
        isRural: false,
        examLocationProvince: '四川',
        examLocationCity: '成都',
        examLocationCounty: '武侯区',
      };
      const r = service.compute(profile as any);
      const expected = Math.round(100 * 0.4 + r.studentSelfCompleteness * 0.6);
      expect(r.overallCompleteness).toBe(expected);
    });
  });
});
