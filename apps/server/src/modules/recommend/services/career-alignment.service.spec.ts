import { CareerAlignmentService } from './career-alignment.service';

describe('CareerAlignmentService', () => {
  let service: CareerAlignmentService;

  beforeEach(() => {
    service = new CareerAlignmentService();
  });

  // ---- career direction keyword matching ----

  describe('career direction keyword matching', () => {
    it('returns +3.0 when student has ≥3 keyword matches with candidate careerDirections', () => {
      const student = {
        careerDirection: '软件工程师，数据分析，人工智能',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件工程师', '数据分析师', '人工智能工程师', '产品经理'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(3.0);
    });

    it('returns +1.5 when student has 1-2 keyword matches', () => {
      const student = {
        careerDirection: '软件工程师，数据分析',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件工程师', '产品经理'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(1.5);
    });

    it('returns 0 when no career direction is set on student', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件工程师', '数据分析师'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 when student careerDirection is undefined', () => {
      const student = {
        careerDirection: undefined,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件工程师'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 when candidate has no careerDirections', () => {
      const student = {
        careerDirection: '软件工程师，数据分析，人工智能',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('skips single-char tokens in student careerDirection', () => {
      // only "的" would be a single-char token, real keywords are 2+ chars
      const student = {
        careerDirection: '工 程',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['工程师'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      // "工" and "程" are single chars, filtered out → 0 matches
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('supports bidirectional substring match (token contains direction)', () => {
      // candidate direction "软件" is contained in student token "软件工程师"
      const student = {
        careerDirection: '软件工程师',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      // bidirectional: token "软件工程师" contains direction "软件" → match
      expect(service.calcBonus(student, candidate)).toBe(1.5);
    });

    it('supports Chinese delimiters: 、；; and /', () => {
      const student = {
        careerDirection: '软件工程师、数据分析；人工智能;产品经理/运营管理',
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['软件工程师', '数据分析师', '人工智能专家', '产品经理'],
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      // matches: 软件工程师(exact), 数据分析(in 数据分析师), 人工智能(in 人工智能专家), 产品经理(exact) → ≥3 → +3.0
      expect(service.calcBonus(student, candidate)).toBe(3.0);
    });
  });

  // ---- postgraduate bonus ----

  describe('postgraduate bonus', () => {
    it('returns +1.0 when careerPlan is POSTGRADUATE and candidate has postgraduateDirections', () => {
      const student = {
        careerDirection: null,
        careerPlan: 'POSTGRADUATE',
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: ['计算机科学', '软件工程'],
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(1.0);
    });

    it('returns 0 when careerPlan is POSTGRADUATE but candidate has no postgraduateDirections', () => {
      const student = {
        careerDirection: null,
        careerPlan: 'POSTGRADUATE',
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 when careerPlan is POSTGRADUATE but postgraduateDirections is empty array', () => {
      const student = {
        careerDirection: null,
        careerPlan: 'POSTGRADUATE',
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: [],
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 for other career plans even if postgraduateDirections exists', () => {
      const student = {
        careerDirection: null,
        careerPlan: 'EMPLOYMENT',
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: ['计算机科学'],
        majorCategory: null,
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });
  });

  // ---- teacher interest bonus ----

  describe('teacher interest bonus', () => {
    it('returns +1.5 when teacherInterest is true and majorCategory includes 教育', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: true,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: '教育学',
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(1.5);
    });

    it('returns 0 when teacherInterest is true but majorCategory does not include 教育', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: true,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: '工学',
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 when teacherInterest is false even if majorCategory includes 教育', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: '教育学',
        batch: null,
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });
  });

  // ---- military interest bonus ----

  describe('military interest bonus', () => {
    it('returns +1.5 when militaryInterest is true and batch includes 军事', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: true,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: '军事院校本科批',
      };
      expect(service.calcBonus(student, candidate)).toBe(1.5);
    });

    it('returns +1.5 when militaryInterest is true and batch includes 军校', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: true,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: '军校提前批',
      };
      expect(service.calcBonus(student, candidate)).toBe(1.5);
    });

    it('returns 0 when militaryInterest is false', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: '军事院校本科批',
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });

    it('returns 0 when militaryInterest is true but batch does not include 军事 or 军校', () => {
      const student = {
        careerDirection: null,
        careerPlan: null,
        teacherInterest: false,
        militaryInterest: true,
      };
      const candidate = {
        careerDirections: null,
        postgraduateDirections: null,
        majorCategory: null,
        batch: '本科一批',
      };
      expect(service.calcBonus(student, candidate)).toBe(0);
    });
  });

  // ---- additive bonuses ----

  describe('additive bonuses', () => {
    it('accumulates multiple bonuses simultaneously', () => {
      // career match ≥3 → +3.0
      // POSTGRADUATE + postgraduateDirections → +1.0
      // teacherInterest + 教育 category → +1.5
      const student = {
        careerDirection: '教师，教育工作者，课程设计',
        careerPlan: 'POSTGRADUATE',
        teacherInterest: true,
        militaryInterest: false,
      };
      const candidate = {
        careerDirections: ['教师资格', '教育工作者', '课程设计师'],
        postgraduateDirections: ['教育学', '课程与教学论'],
        majorCategory: '教育学',
        batch: null,
      };
      // career: 教师(in 教师资格), 教育工作者(exact), 课程设计(in 课程设计师) → 3 matches → +3.0
      // postgrad: POSTGRADUATE + has directions → +1.0
      // teacher: teacherInterest + 教育学 → +1.5
      expect(service.calcBonus(student, candidate)).toBeCloseTo(5.5, 5);
    });
  });
});
