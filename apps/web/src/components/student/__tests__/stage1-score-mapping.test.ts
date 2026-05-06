import {
  to9Subjects,
  from9Subjects,
  validate6Subjects,
  sum9Subjects,
  type Subject9Form,
} from '../stage1-score-mapping';

describe('stage1-score-mapping', () => {
  describe('to9Subjects (profile -> 9 科表单回填)', () => {
    it('物理类典型：物理 + 化学 + 生物', () => {
      const profile = {
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scoreFirstChoice: 92,
        scoreSub1: 88,
        scoreSub2: 85,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scorePhysics: 92,
        scoreChemistry: 88,
        scoreBiology: 85,
      });
    });

    it('历史类典型：历史 + 政治 + 地理', () => {
      const profile = {
        firstChoice: '历史',
        reChoices: ['政治', '地理'],
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreFirstChoice: 80,
        scoreSub1: 78,
        scoreSub2: 82,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreHistory: 80,
        scorePolitics: 78,
        scoreGeography: 82,
      });
    });

    it('空 profile：返回空对象（所有字段 undefined）', () => {
      expect(to9Subjects({})).toEqual({});
    });

    it('缺再选数据：仅首选有值，化生政地全空', () => {
      const profile = {
        firstChoice: '物理',
        scoreFirstChoice: 95,
        scoreChinese: 120,
      };
      expect(to9Subjects(profile)).toEqual({
        scoreChinese: 120,
        scorePhysics: 95,
      });
    });
  });

  describe('from9Subjects (9 科表单 -> 后端 DTO 翻译)', () => {
    it('物理类典型：化学+生物 → sub1=化学,sub2=生物（化→生→政→地 顺序）', () => {
      const form: Subject9Form = {
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        scorePhysics: 92,
        scoreChemistry: 88,
        scoreBiology: 85,
      };
      expect(from9Subjects(form)).toEqual({
        examType: 'PHYSICS',
        firstChoice: '物理',
        scoreFirstChoice: 92,
        reChoices: ['化学', '生物'],
        scoreSub1: 88,
        scoreSub2: 85,
        scoreChinese: 120,
        scoreMath: 130,
        scoreEnglish: 125,
        totalScore: 120 + 130 + 125 + 92 + 88 + 85, // 640
      });
    });

    it('历史类典型 + 跳过中间：政治+地理 → sub1=政治,sub2=地理', () => {
      const form: Subject9Form = {
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        scoreHistory: 80,
        scorePolitics: 78,
        scoreGeography: 82,
      };
      expect(from9Subjects(form)).toEqual({
        examType: 'HISTORY',
        firstChoice: '历史',
        scoreFirstChoice: 80,
        reChoices: ['政治', '地理'],
        scoreSub1: 78,
        scoreSub2: 82,
        scoreChinese: 115,
        scoreMath: 105,
        scoreEnglish: 130,
        totalScore: 115 + 105 + 130 + 80 + 78 + 82, // 590
      });
    });

    it('再选顺序固定为 化→生→政→地（隐式 normalize）', () => {
      // 即使学生先填地理再填化学，输出 reChoices 仍按枚举顺序
      const form: Subject9Form = {
        scoreChinese: 100,
        scoreMath: 100,
        scoreEnglish: 100,
        scorePhysics: 90,
        scoreGeography: 75,
        scoreChemistry: 88,
      };
      const out = from9Subjects(form);
      expect(out.reChoices).toEqual(['化学', '地理']);
      expect(out.scoreSub1).toBe(88); // 化学
      expect(out.scoreSub2).toBe(75); // 地理
    });
  });

  describe('round-trip 一致性', () => {
    it('合规 profile 经 to → from 还原（modulo 再选顺序 normalize）', () => {
      const profile = {
        firstChoice: '物理',
        reChoices: ['化学', '生物'],
        scoreChinese: 120, scoreMath: 130, scoreEnglish: 125,
        scoreFirstChoice: 92, scoreSub1: 88, scoreSub2: 85,
      };
      const restored = from9Subjects(to9Subjects(profile));
      expect(restored.firstChoice).toBe(profile.firstChoice);
      expect(restored.reChoices).toEqual(profile.reChoices);
      expect(restored.scoreFirstChoice).toBe(profile.scoreFirstChoice);
      expect(restored.scoreSub1).toBe(profile.scoreSub1);
      expect(restored.scoreSub2).toBe(profile.scoreSub2);
      expect(restored.scoreChinese).toBe(profile.scoreChinese);
      expect(restored.scoreMath).toBe(profile.scoreMath);
      expect(restored.scoreEnglish).toBe(profile.scoreEnglish);
      expect(restored.totalScore).toBe(120 + 130 + 125 + 92 + 88 + 85);
    });
  });

  describe('validate6Subjects', () => {
    const completeForm: Subject9Form = {
      scoreChinese: 120, scoreMath: 130, scoreEnglish: 125,
      scorePhysics: 92, scoreChemistry: 88, scoreBiology: 85,
    };

    it('6 门齐全：通过', () => {
      expect(validate6Subjects(completeForm)).toBeNull();
    });

    it('缺英语：返回错误信息', () => {
      const f = { ...completeForm, scoreEnglish: undefined };
      expect(validate6Subjects(f)).toMatch(/语文.*数学.*英语/);
    });

    it('物理历史都没填：返回首选缺失错误', () => {
      const f = { ...completeForm, scorePhysics: undefined };
      expect(validate6Subjects(f)).toMatch(/物理.*历史/);
    });

    it('物理历史都填了：返回互斥错误', () => {
      const f = { ...completeForm, scoreHistory: 70 };
      expect(validate6Subjects(f)).toMatch(/只能填一门/);
    });

    it('再选只填了 1 门：返回再选数量错误', () => {
      const f = { ...completeForm, scoreBiology: undefined };
      expect(validate6Subjects(f)).toMatch(/再选.*2 门/);
    });

    it('再选填了 3 门：返回再选数量错误', () => {
      const f = { ...completeForm, scorePolitics: 70 };
      expect(validate6Subjects(f)).toMatch(/再选.*2 门/);
    });
  });

  describe('sum9Subjects', () => {
    it('物理类典型 6 门齐：累加正确', () => {
      expect(sum9Subjects({
        scoreChinese: 120, scoreMath: 130, scoreEnglish: 125,
        scorePhysics: 92, scoreChemistry: 88, scoreBiology: 85,
      })).toBe(640);
    });
    it('历史类 + 政治地理：累加正确', () => {
      expect(sum9Subjects({
        scoreChinese: 115, scoreMath: 105, scoreEnglish: 130,
        scoreHistory: 80, scorePolitics: 78, scoreGeography: 82,
      })).toBe(590);
    });
    it('空表单：返回 0', () => {
      expect(sum9Subjects({})).toBe(0);
    });
    it('部分填写：用 ?? 0 处理 undefined', () => {
      expect(sum9Subjects({ scoreChinese: 100, scoreMath: 100 })).toBe(200);
    });
    it('物理/历史互斥取已填那个', () => {
      const onlyPhysics = sum9Subjects({ scorePhysics: 90 });
      expect(onlyPhysics).toBe(90);
      const onlyHistory = sum9Subjects({ scoreHistory: 75 });
      expect(onlyHistory).toBe(75);
    });
  });
});
