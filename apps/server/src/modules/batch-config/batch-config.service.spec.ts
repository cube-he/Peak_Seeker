import { Test, TestingModule } from '@nestjs/testing';
import { BatchConfigService } from './batch-config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BatchConfigService', () => {
  let service: BatchConfigService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      batchConfig: {
        findMany: jest.fn(),
      },
      studentProfile: {
        findUnique: jest.fn(),
      },
      batchLine: {
        findMany: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchConfigService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(BatchConfigService);
  });

  describe('getPickerOptions', () => {
    it('queries batch_config by year + province and dedupes by batch name', async () => {
      prismaMock.batchConfig.findMany.mockResolvedValue([
        { batch: '本科提前批A段', admissionOrder: 1, examType: '物理' },
        { batch: '本科提前批A段', admissionOrder: 1, examType: '历史' },
        { batch: '本科批A段', admissionOrder: 5, examType: '物理' },
      ]);

      const result = await service.getPickerOptions(2026, '四川');

      expect(prismaMock.batchConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { year: 2026, province: '四川' },
        }),
      );
      // 去重：3 行 → 2 个 unique batch
      expect(result).toEqual([
        { code: '本科提前批A段', name: '本科提前批A段', order: 1 },
        { code: '本科批A段', name: '本科批A段', order: 5 },
      ]);
    });

    it('sorts by admissionOrder ascending', async () => {
      prismaMock.batchConfig.findMany.mockResolvedValue([
        { batch: 'B', admissionOrder: 2, examType: '物理' },
        { batch: 'A', admissionOrder: 1, examType: '物理' },
        { batch: 'C', admissionOrder: 3, examType: '物理' },
      ]);
      const result = await service.getPickerOptions(2026, '四川');
      expect(result.map((r) => r.code)).toEqual(['A', 'B', 'C']);
    });

    it('takes minimum admissionOrder when same batch has different orders across examType', async () => {
      prismaMock.batchConfig.findMany.mockResolvedValue([
        { batch: '某批', admissionOrder: 5, examType: '物理' },
        { batch: '某批', admissionOrder: 3, examType: '历史' },
      ]);
      const result = await service.getPickerOptions(2026, '四川');
      expect(result).toEqual([{ code: '某批', name: '某批', order: 3 }]);
    });
  });

  describe('listEligibleForStudent (升级版返回 verdict + reasons)', () => {
    const baseStudent = {
      id: 10,
      teacherId: 99,
      examType: 'PHYSICS',
      examYear: 2026,
      totalScore: 480,
      province: '四川',
      county: '叙永县',
      isRural: true,
      politicalStatus: null,
      user: { birthDate: new Date('2008-01-01') },
    };

    const teacherUser = {
      role: 'TEACHER',
      teacherProfileId: 99,
      studentProfileId: null,
      isSupervisor: false,
    };

    it('ELIGIBLE 时返回 verdict=ELIGIBLE + SCORE_PASS + 现有 meta 字段', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(baseStudent);
      prismaMock.batchConfig.findMany.mockResolvedValue([
        {
          id: 1,
          batch: '本科批A段',
          examType: '物理',
          maxGroupCount: 45,
          maxMajorPerGroup: 6,
          volunteerMode: 'parallel',
          admissionOrder: 5,
          eligibilityRules: {
            scoreFloor: { type: 'BATCH_LINE' },
            examTypes: ['物理', '历史'],
            volunteerMode: 'PARALLEL',
            hardEligibility: [],
          },
        },
      ]);
      prismaMock.batchLine.findMany.mockResolvedValue([
        { batch: '本科批次', examType: '物理类', score: 438 },
      ]);

      const result = await service.listEligibleForStudent(10, teacherUser);
      expect(result).toHaveLength(1);
      expect(result[0].verdict).toBe('ELIGIBLE');
      expect(result[0].reasons.find((r: any) => r.type === 'SCORE_PASS')).toBeDefined();
      expect(result[0].batchConfigId).toBe(1);
      expect(result[0].batchName).toBe('本科批A段');
      expect(result[0].maxGroupCount).toBe(45);
      expect(result[0].volunteerMode).toBe('parallel');
      expect(result[0].admissionOrder).toBe(5);
    });

    it('SUBSET 硬资格不满足时 verdict=CONDITIONAL + HARD_SUBSET_FAIL', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue({
        ...baseStudent,
        county: '其他县',
        isRural: true,
      });
      prismaMock.batchConfig.findMany.mockResolvedValue([
        {
          id: 1,
          batch: '本科批A段',
          examType: '物理',
          maxGroupCount: 45,
          maxMajorPerGroup: 6,
          volunteerMode: 'parallel',
          admissionOrder: 5,
          eligibilityRules: {
            scoreFloor: { type: 'BATCH_LINE' },
            examTypes: ['物理'],
            volunteerMode: 'PARALLEL',
            hardEligibility: [
              {
                scope: 'SUBSET',
                subset: '国家专项',
                rule: 'HOUSEHOLD_IN_REGION',
                params: { regions: ['叙永县'] },
              },
            ],
          },
        },
      ]);
      prismaMock.batchLine.findMany.mockResolvedValue([
        { batch: '本科批次', examType: '物理类', score: 438 },
      ]);

      const result = await service.listEligibleForStudent(10, teacherUser);
      expect(result[0].verdict).toBe('CONDITIONAL');
      expect(
        result[0].reasons.find((r: any) => r.type === 'HARD_SUBSET_FAIL' && r.subset === '国家专项'),
      ).toBeDefined();
    });

    it('SCORE_FAIL 时 verdict 不再 INELIGIBLE (新方案: 分数仅作展示)', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue({
        ...baseStudent,
        totalScore: 400,
      });
      prismaMock.batchConfig.findMany.mockResolvedValue([
        {
          id: 1,
          batch: '本科批A段',
          examType: '物理',
          maxGroupCount: 45,
          maxMajorPerGroup: 6,
          volunteerMode: 'parallel',
          admissionOrder: 5,
          eligibilityRules: {
            scoreFloor: { type: 'BATCH_LINE' },
            examTypes: ['物理'],
            volunteerMode: 'PARALLEL',
            hardEligibility: [],
          },
        },
      ]);
      prismaMock.batchLine.findMany.mockResolvedValue([
        { batch: '本科批次', examType: '物理类', score: 438 },
      ]);

      const result = await service.listEligibleForStudent(10, teacherUser);
      expect(result[0].verdict).toBe('ELIGIBLE');  // 不再 INELIGIBLE
      expect(result[0].reasons.find((r: any) => r.type === 'SCORE_FAIL')).toBeDefined();
      expect(result[0].scoreInfo?.gap).toBe(-38);
    });

    it('Prisma 查询传 orderBy: admissionOrder asc, 排序交给 DB', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(baseStudent);
      prismaMock.batchConfig.findMany.mockResolvedValue([]);
      prismaMock.batchLine.findMany.mockResolvedValue([]);

      await service.listEligibleForStudent(10, teacherUser);
      const batchConfigCall = prismaMock.batchConfig.findMany.mock.calls[0][0];
      expect(batchConfigCall.orderBy).toEqual({ admissionOrder: 'asc' });
    });

    it('eligibilityRules 为 null (老数据) → ELIGIBLE 且 reasons 为空', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(baseStudent);
      prismaMock.batchConfig.findMany.mockResolvedValue([
        {
          id: 1,
          batch: '本科批A段',
          examType: '物理',
          maxGroupCount: 45,
          maxMajorPerGroup: 6,
          volunteerMode: 'parallel',
          admissionOrder: 5,
          eligibilityRules: null,
        },
      ]);
      prismaMock.batchLine.findMany.mockResolvedValue([]);

      const result = await service.listEligibleForStudent(10, teacherUser);
      expect(result[0].verdict).toBe('ELIGIBLE');
      expect(result[0].reasons).toEqual([]);
    });
  });

  describe('listEligibleForStudent V2 (含 subsetResults)', () => {
    const baseStudent = {
      id: 10,
      teacherId: 99,
      examType: 'PHYSICS',
      examYear: 2026,
      totalScore: 480,
      province: '四川',
      county: '叙永县',
      isRural: true,
      politicalStatus: null,
      user: { birthDate: new Date('2008-01-01') },
    };
    const teacherUser = {
      role: 'TEACHER',
      teacherProfileId: 99,
      studentProfileId: null,
      isSupervisor: false,
    };

    it('返回 subsetResults 数组 (V2 结构)', async () => {
      prismaMock.studentProfile.findUnique.mockResolvedValue(baseStudent);
      prismaMock.batchConfig.findMany.mockResolvedValue([
        {
          id: 1,
          batch: '本科批A段',
          examType: '物理',
          maxGroupCount: 45,
          maxMajorPerGroup: 6,
          volunteerMode: 'parallel',
          admissionOrder: 5,
          eligibilityRules: {
            scoreFloor: { type: 'BATCH_LINE' },
            examTypes: ['物理'],
            volunteerMode: 'PARALLEL',
            hardEligibility: [],
            subsets: [
              {
                code: 'puton',
                name: '普通类',
                description: '一般本科',
                hardRules: [],
                references: [],
              },
              {
                code: 'guojia',
                name: '国家专项',
                description: '面向贫困县',
                hardRules: [
                  {
                    scope: 'SUBSET',
                    subset: '国家专项',
                    rule: 'RURAL_HOUSEHOLD_IN_REGION',
                    params: { regions: ['叙永县'] },
                  },
                ],
                references: [
                  { title: '119 县名单', filename: 'p119.xlsx', type: 'xlsx' },
                ],
              },
            ],
          },
        },
      ]);
      prismaMock.batchLine.findMany.mockResolvedValue([
        { batch: '本科批次', examType: '物理类', score: 438 },
      ]);

      const result = await service.listEligibleForStudent(10, teacherUser);
      expect(result[0].verdict).toBe('ELIGIBLE');
      expect(result[0].subsetResults).toHaveLength(2);
      expect(result[0].subsetResults?.[0].code).toBe('puton');
      expect(result[0].subsetResults?.[1].code).toBe('guojia');
      expect(result[0].subsetResults?.[1].references[0].downloadUrl).toBe(
        '/attachments/policy/p119.xlsx',
      );
    });
  });
});
