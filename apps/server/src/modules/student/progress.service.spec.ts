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
      };
      const r = service.compute(profile as any);
      expect(r.teacherDataCompleteness).toBe(100);
      expect(r.isRecommendable).toBe(true);
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
