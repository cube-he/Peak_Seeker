import { Test, TestingModule } from '@nestjs/testing';
import { BonusCalcService } from './bonus-calc.service';
import type { BonusCalcInput } from './bonus-calc.types';

describe('BonusCalcService', () => {
  let service: BonusCalcService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BonusCalcService],
    }).compile();
    service = module.get<BonusCalcService>(BonusCalcService);
  });

  describe('无加分情况', () => {
    it('普通汉族成都学生：bonusValue=0，无 matched/applied', () => {
      const r = service.calculate({
        ethnicity: '汉族',
        province: '四川',
        city: '成都市',
        county: '武侯区',
      });
      expect(r.bonusValue).toBe(0);
      expect(r.appliedItem).toBeNull();
      expect(r.matchedItems).toEqual([]);
    });

    it('完全空输入：bonusValue=0，不抛异常', () => {
      const r = service.calculate({});
      expect(r.bonusValue).toBe(0);
    });
  });

  describe('民族地区加分（5）', () => {
    it('凉山州彝族：+20', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '凉山州',
      });
      expect(r.bonusValue).toBe(20);
      expect(r.appliedItem?.type).toBe('ETHNIC_AREA_MINORITY');
    });

    it('阿坝藏族羌族自治州藏族：+20（容错全称）', () => {
      const r = service.calculate({
        ethnicity: '藏族',
        province: '四川',
        city: '阿坝藏族羌族自治州',
      });
      expect(r.bonusValue).toBe(20);
    });

    it('甘孜州汉族：+10', () => {
      const r = service.calculate({
        ethnicity: '汉族',
        province: '四川',
        city: '甘孜州',
      });
      expect(r.bonusValue).toBe(10);
      expect(r.appliedItem?.type).toBe('ETHNIC_AREA_HAN');
    });

    it('攀枝花仁和区少数民族：+20（两区认定）', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '攀枝花市',
        county: '仁和区',
      });
      expect(r.bonusValue).toBe(20);
    });

    it('北川羌族自治县汉族：+10（十七县）', () => {
      const r = service.calculate({
        ethnicity: '汉族',
        province: '四川',
        city: '绵阳市',
        county: '北川羌族自治县',
      });
      expect(r.bonusValue).toBe(10);
    });

    it('非四川的彝族：不享受地区加分', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '云南',
        city: '楚雄州',
      });
      expect(r.bonusValue).toBe(0);
    });
  });

  describe('申报项加分', () => {
    it('烈士子女：+20', () => {
      const r = service.calculate({
        declaredItems: [{ type: 'MARTYR_CHILD' }],
      });
      expect(r.bonusValue).toBe(20);
      expect(r.appliedItem?.type).toBe('MARTYR_CHILD');
    });

    it('归侨子女：+5', () => {
      const r = service.calculate({
        declaredItems: [{ type: 'OVERSEAS_CHILD' }],
      });
      expect(r.bonusValue).toBe(5);
    });

    it('未知 type 字符串：忽略不算', () => {
      const r = service.calculate({
        declaredItems: [{ type: 'UNKNOWN_FOO' }],
      });
      expect(r.bonusValue).toBe(0);
    });
  });

  describe('多项符合时取最高一项不累加（核心规则）', () => {
    it('凉山州彝族 + 烈士子女：取 +20（并列最高，应用单条）', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '凉山州',
        declaredItems: [{ type: 'MARTYR_CHILD' }],
      });
      // 取一项 +20，不能 +40
      expect(r.bonusValue).toBe(20);
      // matched 应包含 2 条命中
      expect(r.matchedItems.length).toBeGreaterThanOrEqual(2);
    });

    it('甘孜州汉族 (+10) + 自主就业退役士兵 (+10) + 归侨 (+5)：取 +10', () => {
      const r = service.calculate({
        ethnicity: '汉族',
        province: '四川',
        city: '甘孜州',
        declaredItems: [
          { type: 'VETERAN_SELF_EMPLOYED' },
          { type: 'OVERSEAS_RETURNED' },
        ],
      });
      expect(r.bonusValue).toBe(10);
    });

    it('凉山州彝族 (+20) + 归侨 (+5)：取 +20', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '凉山州',
        declaredItems: [{ type: 'OVERSEAS_RETURNED' }],
      });
      expect(r.bonusValue).toBe(20);
      expect(r.appliedItem?.type).toBe('ETHNIC_AREA_MINORITY');
    });
  });

  describe('优先录取标记（不计入 bonusValue）', () => {
    it('5A 青年志愿者：bonusValue=0，priorityFlags 含 1 项', () => {
      const r = service.calculate({
        declaredItems: [{ type: 'PRIORITY_5A_VOLUNTEER' }],
      });
      expect(r.bonusValue).toBe(0);
      expect(r.priorityFlags.length).toBe(1);
      expect(r.priorityFlags[0].type).toBe('PRIORITY_5A_VOLUNTEER');
    });

    it('烈士子女 + 5A 志愿者：bonusValue=20，且 priorityFlags 含 5A', () => {
      const r = service.calculate({
        declaredItems: [
          { type: 'MARTYR_CHILD' },
          { type: 'PRIORITY_5A_VOLUNTEER' },
        ],
      });
      expect(r.bonusValue).toBe(20);
      expect(r.priorityFlags.length).toBe(1);
    });
  });

  describe('caveats（前端展示）', () => {
    it('有 bonusValue 时附"艺术不分省/运动队/民语/预科 不享受加分"提示', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '凉山州',
      });
      expect(r.caveats.some((c) => c.includes('不享受加分'))).toBe(true);
    });

    it('有民族地区加分时提示"三统一"未自动核验', () => {
      const r = service.calculate({
        ethnicity: '彝族',
        province: '四川',
        city: '凉山州',
      });
      expect(r.caveats.some((c) => c.includes('三统一'))).toBe(true);
    });
  });
});
