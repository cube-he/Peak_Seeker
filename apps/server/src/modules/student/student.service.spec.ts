import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StudentStatus } from '@prisma/client';

// Mock bcrypt — keep hash deterministic for tests
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('StudentService', () => {
  let service: StudentService;
  let scoreSegmentService: { scoreToRank: jest.Mock };
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    teacherProfile: {
      findUnique: jest.Mock;
    };
    studentProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    batchConfig: {
      findMany: jest.Mock;
    };
    studentFieldChangeLog: {
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      teacherProfile: {
        findUnique: jest.fn(),
      },
      studentProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      batchConfig: {
        // C1 修复: confirmBatches 改用 batchConfig 真值源校验批次名 (不再硬编码白名单).
        // 默认返回代表性批次集合 (含旧白名单 5 项 + 强基计划等旧白名单遗漏的真实批次).
        findMany: jest.fn().mockResolvedValue([
          { batch: '本科提前批A段' },
          { batch: '本科提前批B段' },
          { batch: '本科批B段' },
          { batch: '本科批A段（国家专项）' },
          { batch: '强基计划' },
          { batch: '高职提前批' },
          { batch: '高职批' },
        ]),
      },
      studentFieldChangeLog: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
    };

    scoreSegmentService = {
      scoreToRank: jest.fn().mockResolvedValue({
        year: 2026, examType: '物理', score: 600, rank: 28500, percentile: 0.04,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ProgressService,
          useValue: {
            compute: jest.fn().mockReturnValue({
              studentSelfCompleteness: 50,
              teacherDataCompleteness: 50,
              stageProgress: {
                stage1: { filled: 1, total: 15, completed: false },
                stage2: { filled: 0, total: 15, completed: false },
                stage3: { filled: 0, total: 24, completed: false },
              },
              overallCompleteness: 50,
              isRecommendable: false,
              missingFieldsForRecommend: [],
            }),
          },
        },
        {
          provide: require('../score-segment/score-segment.service').ScoreSegmentService,
          useValue: scoreSegmentService,
        },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
  });

  // ── create ──────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      username: 'student01',
      password: '123456',
      realName: '张三',
      phone: '13800000001',
      highSchool: '成都七中',
    };

    it('should create a student with User + StudentProfile', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no duplicate
      const created = {
        id: 1,
        username: 'student01',
        realName: '张三',
        studentProfile: {
          id: 10,
          teacherId: 5,
          highSchool: '成都七中',
          status: StudentStatus.ACTIVE,
        },
      };
      prisma.user.create.mockResolvedValue(created);

      const result = await service.create(5, dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'student01' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: 'student01',
            passwordHash: 'hashed_password',
            realName: '张三',
            studentProfile: expect.objectContaining({
              create: expect.objectContaining({
                teacherId: 5,
                highSchool: '成都七中',
                status: StudentStatus.ACTIVE,
              }),
            }),
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it('should throw ConflictException on duplicate username', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 99 });

      await expect(service.create(5, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findByTeacher ───────────────────────────────────────

  describe('findByTeacher', () => {
    it('should return paginated results for a teacher (with progress per item)', async () => {
      const profiles = [{ id: 1 }, { id: 2 }];
      prisma.studentProfile.findMany.mockResolvedValue(profiles);
      prisma.studentProfile.count.mockResolvedValue(2);

      const result = await service.findByTeacher(5, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(result.data).toHaveLength(2);
      // findByTeacher 注入 progress 字段（双轨完整度）— M6.4
      expect(result.data[0]).toHaveProperty('progress');
      expect(result.data[1]).toHaveProperty('progress');

      // Verify teacher filter was applied
      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teacherId: 5 }),
        }),
      );
    });

    it('should filter by status and keyword', async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);
      prisma.studentProfile.count.mockResolvedValue(0);

      await service.findByTeacher(5, {
        status: StudentStatus.ACTIVE,
        keyword: '张',
        page: 1,
        pageSize: 10,
      });

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teacherId: 5,
            status: StudentStatus.ACTIVE,
            user: {
              OR: [
                { realName: { contains: '张' } },
                { username: { contains: '张' } },
              ],
            },
          }),
        }),
      );
    });

    it('lets admin callers filter unassigned students', async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);
      prisma.studentProfile.count.mockResolvedValue(0);

      await service.findByTeacher(undefined, {
        assignmentStatus: 'UNASSIGNED',
        page: 1,
        pageSize: 20,
      } as any);

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teacherId: null }),
        }),
      );
      expect(prisma.studentProfile.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ teacherId: null }),
      });
    });

    it('lets admin callers filter students by assigned teacher', async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);
      prisma.studentProfile.count.mockResolvedValue(0);

      await service.findByTeacher(undefined, {
        teacherProfileId: 10,
        page: 1,
        pageSize: 20,
      } as any);

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teacherId: 10 }),
          include: expect.objectContaining({
            teacher: expect.any(Object),
          }),
        }),
      );
    });

    it('keeps teacher callers scoped to their own students even with admin filters', async () => {
      prisma.studentProfile.findMany.mockResolvedValue([]);
      prisma.studentProfile.count.mockResolvedValue(0);

      await service.findByTeacher(5, {
        assignmentStatus: 'UNASSIGNED',
        teacherProfileId: 10,
        page: 1,
        pageSize: 20,
      } as any);

      expect(prisma.studentProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teacherId: 5 }),
        }),
      );
    });
  });

  describe('rankCheck', () => {
    it('computes system rank on detail load even when provincialRank is already filled', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 10,
        dataVersion: 1,
        status: StudentStatus.ACTIVE,
        examYear: 2026,
        examType: 'PHYSICS',
        totalScore: 600,
        provincialRank: 1,
        user: {
          id: 99,
          username: 'student01',
          realName: '测试学生',
          phone: '13800000000',
          gender: 'MALE',
          ethnicity: '汉族',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        teacher: null,
      });

      const result = await service.findById(10) as any;

      expect(scoreSegmentService.scoreToRank).toHaveBeenCalledWith(2026, '物理', 600);
      expect(result.rankCheck).toEqual(
        expect.objectContaining({
          calculatedRank: 28500,
          currentRank: 1,
          isMismatch: true,
        }),
      );
    });

    it('uses 2025 score segment data as the temporary source for 2026 rank checks', async () => {
      scoreSegmentService.scoreToRank.mockImplementation(async (year: number) => {
        if (year === 2026) {
          throw new Error('2026 score segment data not found');
        }
        return { year: 2025, examType: '物理', score: 479, rank: 156000, percentile: 0.55 };
      });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 10,
        dataVersion: 1,
        status: StudentStatus.ACTIVE,
        examYear: 2026,
        examType: 'PHYSICS',
        totalScore: 479,
        provincialRank: 1,
        user: {
          id: 99,
          username: 'student01',
          realName: '测试学生',
          phone: '13800000000',
          gender: 'MALE',
          ethnicity: '汉族',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        teacher: null,
      });

      const result = await service.findById(10) as any;

      expect(scoreSegmentService.scoreToRank).toHaveBeenNthCalledWith(1, 2026, '物理', 479);
      expect(scoreSegmentService.scoreToRank).toHaveBeenNthCalledWith(2, 2025, '物理', 479);
      expect(result.rankCheck).toEqual(
        expect.objectContaining({
          calculatedRank: 156000,
          currentRank: 1,
          isMismatch: true,
          requestedYear: 2026,
          sourceYear: 2025,
          isEstimated: true,
          source: 'score-segment',
        }),
      );
    });
  });

  // ── updateProfile ───────────────────────────────────────

  describe('updateProfile', () => {
    it('should update profile and increment dataVersion', async () => {
      const current = {
        id: 10,
        dataVersion: 3,
        status: StudentStatus.ACTIVE,
        highSchool: '成都七中',
        examYear: null,
        examType: null,
        firstChoice: null,
        totalScore: null,
        priorityMode: null,
        careerPlan: null,
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);

      const updated = { ...current, city: '成都', dataVersion: 4 };
      prisma.studentProfile.update.mockResolvedValue(updated);

      const result = await service.updateProfile(10, {
        dataVersion: 3,
        city: '成都',
      });

      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            city: '成都',
            dataVersion: { increment: 1 },
          }),
        }),
      );
      expect(result).toHaveProperty('infoCompleteness');
    });

    it('should throw ConflictException on version mismatch', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 10,
        dataVersion: 5,
      });

      await expect(
        service.updateProfile(10, { dataVersion: 3, city: '成都' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if student does not exist', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile(999, { dataVersion: 0 }),
      ).rejects.toThrow(NotFoundException);
    });

    // 手机号唯一约束冲突应转成友好 400，而不是冒成 500（Internal server error）
    it('手机号重复时抛 BadRequestException 而非原始 Prisma 500', async () => {
      const current = {
        id: 10,
        dataVersion: 3,
        status: StudentStatus.ACTIVE,
        examYear: null,
        examType: null,
        firstChoice: null,
        totalScore: null,
        priorityMode: null,
        careerPlan: null,
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the constraint: `users_phone_key`',
        { code: 'P2002', clientVersion: '7.4.2', meta: { target: 'users_phone_key' } },
      );
      prisma.studentProfile.update.mockRejectedValue(p2002);

      await expect(
        service.updateProfile(10, { dataVersion: 3, phone: '13800138000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // 自动保存场景：前端 PATCH 单字段时不发 dataVersion，应跳过乐观锁正常更新（last-write-wins）
    it('should skip optimistic lock when dataVersion is omitted (auto-save)', async () => {
      const current = {
        id: 10,
        dataVersion: 7,
        status: StudentStatus.ACTIVE,
        examYear: null,
        examType: null,
        firstChoice: null,
        totalScore: null,
        priorityMode: null,
        careerPlan: null,
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);
      prisma.studentProfile.update.mockResolvedValue({ ...current, totalScore: 750, dataVersion: 8 });

      await expect(
        service.updateProfile(10, { totalScore: 750 } as any),
      ).resolves.toBeDefined();

      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            totalScore: 750,
            dataVersion: { increment: 1 },
          }),
        }),
      );
    });

    it('preserves teacher-entered provincialRank and returns mismatch when system rank differs', async () => {
      const current = {
        id: 10,
        dataVersion: 1,
        status: StudentStatus.ACTIVE,
        examYear: 2026,
        examType: 'PHYSICS',
        totalScore: 600,
        provincialRank: 28500,
        user: {
          realName: '测试学生',
          phone: '13800000000',
          gender: 'MALE',
          ethnicity: '汉族',
        },
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);
      prisma.studentProfile.update.mockResolvedValue({
        ...current,
        provincialRank: 1,
        dataVersion: 2,
      });

      const result = await service.updateProfile(10, {
        dataVersion: 1,
        provincialRank: 1,
      } as any) as any;

      expect(scoreSegmentService.scoreToRank).toHaveBeenCalledWith(2026, '物理', 600);
      const call = prisma.studentProfile.update.mock.calls[0][0] as any;
      expect(call.data.provincialRank).toBe(1);
      expect(result.rankCheck).toEqual(
        expect.objectContaining({
          calculatedRank: 28500,
          currentRank: 1,
          isMismatch: true,
        }),
      );
    });

    it('splits user-level identity fields into the related user update', async () => {
      const current = {
        id: 10,
        dataVersion: 1,
        status: StudentStatus.ACTIVE,
        examYear: null,
        examType: null,
        firstChoice: null,
        totalScore: null,
        priorityMode: null,
        careerPlan: null,
        user: {
          realName: 'Old Name',
          phone: '13800000000',
          gender: 'FEMALE',
          ethnicity: '汉族',
        },
      };
      prisma.studentProfile.findUnique.mockResolvedValue(current);
      prisma.studentProfile.update.mockResolvedValue({
        ...current,
        politicalStatus: 'LEAGUE_MEMBER',
        dataVersion: 2,
      });

      await service.updateProfile(10, {
        dataVersion: 1,
        realName: 'Li Bai',
        phone: '13800138000',
        gender: 'MALE',
        ethnicity: '汉族',
        politicalStatus: 'LEAGUE_MEMBER',
      } as any);

      const call = prisma.studentProfile.update.mock.calls[0][0] as any;
      expect(call.data).toEqual(
        expect.objectContaining({
          politicalStatus: 'LEAGUE_MEMBER',
          user: {
            update: {
              realName: 'Li Bai',
              phone: '13800138000',
              gender: 'MALE',
              ethnicity: '汉族',
            },
          },
        }),
      );
      expect(call.data.realName).toBeUndefined();
      expect(call.data.phone).toBeUndefined();
      expect(call.data.gender).toBeUndefined();
      expect(call.data.ethnicity).toBeUndefined();
    });
  });

  describe('assignTeacher', () => {
    it('assigns a student to an existing teacher profile', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({ id: 1 });
      prisma.teacherProfile.findUnique.mockResolvedValue({ id: 10 });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1,
        teacherId: 10,
      });

      await service.assignTeacher(1, 10);

      expect(prisma.teacherProfile.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { teacherId: 10 },
        }),
      );
    });

    it('can clear the assigned teacher', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 10 });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1,
        teacherId: null,
      });

      await service.assignTeacher(1, null as any);

      expect(prisma.teacherProfile.findUnique).not.toHaveBeenCalled();
      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { teacherId: null },
        }),
      );
    });

    it('rejects assignment to a missing teacher profile', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({ id: 1 });
      prisma.teacherProfile.findUnique.mockResolvedValue(null);

      await expect(service.assignTeacher(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // calculateCompleteness 旧测试已删除；新算法覆盖在 progress.service.spec.ts

  // ── getMyProfile ────────────────────────────────────────

  describe('getMyProfile', () => {
    it('返回的档案不含 TEACHER_ONLY_FIELDS', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        // teacher-only fields existing in DB
        totalScore: 600,
        provincialRank: 1000,
        scoreChinese: 120,
        province: '四川',
        city: '成都',
        county: '武侯区',
        isRural: false,
        bonusItems: [],
        bonusPolicyStatus: 'NONE',
        examLocationProvince: '四川',
        // student-visible fields
        formFiller: 'STUDENT',
        user: {
          id: 100,
          realName: '小王',
          phone: '13800000000',
          gender: 'MALE',
        },
      });

      const result = await service.getMyProfile(100);
      // ① teacher-only 字段被过滤（2026-05-06: 只剩 provincialRank）
      expect(result).not.toHaveProperty('provincialRank');
      // ② 分数字段：学生自填，应该在响应中
      expect(result).toHaveProperty('totalScore');
      expect(result).toHaveProperty('scoreChinese');
      // 户籍/加分/高考所在地字段：2026-05-06 重新放权给学生，现在应出现在响应中
      expect(result).toHaveProperty('province');
      expect(result).toHaveProperty('city');
      expect(result).toHaveProperty('county');
      expect(result).toHaveProperty('isRural');
      expect(result).toHaveProperty('bonusItems');
      expect(result).toHaveProperty('bonusPolicyStatus');
      expect(result).toHaveProperty('examLocationProvince');
      // student-visible fields preserved
      expect(result).toHaveProperty('formFiller', 'STUDENT');
      expect(result).toHaveProperty('user');
    });

    it('返回 progress 字段', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        formFiller: 'STUDENT',
        user: { id: 100, realName: '小王', phone: '13800000000', gender: 'MALE' },
      });

      const result = await service.getMyProfile(100);
      expect(result).toHaveProperty('progress');
      expect((result as any).progress).toHaveProperty('studentSelfCompleteness');
      expect((result as any).progress).toHaveProperty('stageProgress');
      expect((result as any).progress).toHaveProperty('isRecommendable');
    });

    it('找不到时抛 NotFoundException', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);
      await expect(service.getMyProfile(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateMyProfile (2026-05-06 redesign) ───────────────

  describe('intake workflow', () => {
    it('submitMyIntake marks a complete student intake as SUBMITTED (不再写 batchesConfirmedAt)', async () => {
      (service as any).progressService.compute.mockReturnValue({
        studentSelfCompleteness: 100,
        teacherDataCompleteness: 0,
        stageProgress: {
          stage1: { filled: 16, total: 16, completed: true },
          stage2: { filled: 0, total: 15, completed: false },
          stage3: { filled: 0, total: 26, completed: false },
        },
        overallCompleteness: 60,
        isRecommendable: false,
        missingFieldsForRecommend: [],
      });
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        intakeStatus: 'DRAFT',
        preferredBatches: [],
        user: { id: 100, realName: '小王', phone: '13800000000', gender: 'MALE' },
      });
      prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'SUBMITTED' });

      const result = await (service as any).submitMyIntake(100);

      expect(result).toHaveProperty('intakeStatus', 'SUBMITTED');
      const updateCall = prisma.studentProfile.update.mock.calls[0][0];
      expect(updateCall.data.intakeStatus).toBe('SUBMITTED');
      expect(updateCall.data.intakeSubmittedAt).toEqual(expect.any(Date));
      // 关键: 不再写 batchesConfirmedAt
      expect(updateCall.data.batchesConfirmedAt).toBeUndefined();
    });

    describe('confirmBatches', () => {
      it('成功: 写入 preferredBatches + batchesConfirmedAt + intakeStatus=VERIFIED', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({
          id: 1,
          teacherId: 5,
          intakeStatus: 'SUBMITTED',
          examType: 'PHYSICS',
          county: '叙永县',
          isRural: true,
          user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' },
        });
        prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'VERIFIED' });

        const result = await (service as any).confirmBatches(1, {
          teacherProfileId: 5,
          reviewerUserId: 20,
          preferredBatches: ['本科提前批A段', '本科批B段'],
          reviewComment: '面谈后确认',
        });

        expect(result).toHaveProperty('intakeStatus', 'VERIFIED');
        expect(prisma.studentProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 1 },
            data: expect.objectContaining({
              preferredBatches: ['本科提前批A段', '本科批B段'],
              batchesConfirmedAt: expect.any(Date),
              intakeStatus: 'VERIFIED',
              intakeReviewedBy: 20,
              intakeReviewedAt: expect.any(Date),
              intakeReviewComment: '面谈后确认',
            }),
          }),
        );
      });

      it('校验失败: preferredBatches 为空数组 → BadRequest', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED', examType: 'PHYSICS', county: '叙永县', isRural: true, user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' } });
        await expect(
          (service as any).confirmBatches(1, {
            teacherProfileId: 5,
            reviewerUserId: 20,
            preferredBatches: [],
          }),
        ).rejects.toThrow(/至少选定/);
      });

      it('校验失败: preferredBatches 含 batchConfig 外的批次 → BadRequest', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED', examType: 'PHYSICS', county: '叙永县', isRural: true, user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' } });
        await expect(
          (service as any).confirmBatches(1, {
            teacherProfileId: 5,
            reviewerUserId: 20,
            preferredBatches: ['火星大学批次'],
          }),
        ).rejects.toThrow(/未知批次/);
      });

      // C1 回归: 旧实现用硬编码白名单 (仅 6 批次), 把 batchConfig 里真实存在的多数批次误判为"未知".
      // 修复后改用 batchConfig 真值源, 强基计划等应可正常提交.
      it('C1 修复: 旧白名单外但 batchConfig 内的批次 (强基计划) 应可提交成功', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({
          id: 1, teacherId: 5, intakeStatus: 'SUBMITTED', examType: 'PHYSICS',
          county: '叙永县', isRural: true,
          user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' },
        });
        prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'VERIFIED' });

        const result = await (service as any).confirmBatches(1, {
          teacherProfileId: 5,
          reviewerUserId: 20,
          preferredBatches: ['强基计划'],
        });

        expect(result).toHaveProperty('intakeStatus', 'VERIFIED');
        expect(prisma.studentProfile.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ preferredBatches: ['强基计划'] }),
          }),
        );
      });

      it('校验失败: 学生 intakeStatus = DRAFT → Conflict', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'DRAFT', examType: 'PHYSICS', county: '叙永县', isRural: true, user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' } });
        await expect(
          (service as any).confirmBatches(1, {
            teacherProfileId: 5,
            reviewerUserId: 20,
            preferredBatches: ['本科批A段'],
          }),
        ).rejects.toThrow(/学生尚未提交资料/);
      });

      it('权限: 非所属老师 → Forbidden', async () => {
        prisma.studentProfile.findUnique.mockResolvedValue({ id: 1, teacherId: 5, intakeStatus: 'SUBMITTED', examType: 'PHYSICS', county: '叙永县', isRural: true, user: { birthDate: new Date('2008-01-01'), ethnicity: '汉族', gender: 'MALE' } });
        await expect(
          (service as any).confirmBatches(1, {
            teacherProfileId: 99,
            reviewerUserId: 20,
            preferredBatches: ['本科批A段'],
          }),
        ).rejects.toThrow(/无权/);
      });
    });

    it('unlockBatches 解锁锁定的批次, 写入 unlockBy + intakeStatus NEEDS_CHANGES', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        teacherId: 5,
        batchesConfirmedAt: new Date('2026-06-01'),
      });
      prisma.studentProfile.update.mockResolvedValue({ id: 1 });

      const result = await (service as any).unlockBatches(1, 20, 5);

      expect(result).toEqual({ unlocked: true });
      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            batchesConfirmedAt: null,
            batchesUnlockedBy: 20,
            batchesUnlockedAt: expect.any(Date),
            intakeStatus: 'NEEDS_CHANGES',
          }),
        }),
      );
    });

    it('unlockBatches 未锁定时返回 unlocked=false 不写库', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        teacherId: 5,
        batchesConfirmedAt: null,
      });
      const result = await (service as any).unlockBatches(1, 20, 5);
      expect(result.unlocked).toBe(false);
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it('unlockBatches 非所属老师 → ForbiddenException', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        teacherId: 5,
        batchesConfirmedAt: new Date('2026-06-01'),
      });
      await expect((service as any).unlockBatches(1, 30, 99)).rejects.toThrow(/无权/);
      expect(prisma.studentProfile.update).not.toHaveBeenCalled();
    });

    it('reviewIntake verifies an assigned student for plan creation', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        teacherId: 5,
        intakeStatus: 'SUBMITTED',
      });
      prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'VERIFIED' });

      const result = await (service as any).reviewIntake(1, {
        teacherProfileId: 5,
        reviewerUserId: 20,
        action: 'VERIFY',
        comment: '资料已核验',
      });

      expect(result).toHaveProperty('intakeStatus', 'VERIFIED');
      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            intakeStatus: 'VERIFIED',
            intakeReviewedBy: 20,
            intakeReviewComment: '资料已核验',
          }),
        }),
      );
    });
  });

  describe('updateMyProfile (2026-05-06 redesign)', () => {
    it('accepts province/city/county and writes hukouUpdatedBy=student', async () => {
      const profileId = 100;
      prisma.studentProfile.findUnique.mockResolvedValue({ id: profileId, userId: 1, dataVersion: 0 });
      prisma.studentProfile.update.mockResolvedValue({
        id: profileId, userId: 1, province: '四川', city: '成都', dataVersion: 1,
        user: { id: 1, realName: '小王' },
      });

      await service.updateMyProfile(1, { dataVersion: 0, province: '四川', city: '成都' } as any);

      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            province: '四川',
            city: '成都',
            hukouUpdatedBy: 'student',
            hukouUpdatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('accepts bonusPolicyStatus and writes bonusUpdatedBy=student', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({ id: 100, userId: 1, dataVersion: 0 });
      prisma.studentProfile.update.mockResolvedValue({
        id: 100, userId: 1, bonusPolicyStatus: 'MINORITY', dataVersion: 1,
        user: { id: 1, realName: '小王' },
      });

      await service.updateMyProfile(1, { dataVersion: 0, bonusPolicyStatus: 'MINORITY' } as any);

      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bonusPolicyStatus: 'MINORITY',
            bonusUpdatedBy: 'student',
            bonusUpdatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('still rejects provincialRank from student PATCH', async () => {
      await expect(
        service.updateMyProfile(1, { provincialRank: 12345 } as any),
      ).rejects.toThrow('仅老师可修改');
    });

    it('does NOT write provenance when no STUDENT_NEWLY_WRITABLE field is in dto', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({ id: 100, userId: 1, dataVersion: 0 });
      prisma.studentProfile.update.mockResolvedValue({
        id: 100, userId: 1, dataVersion: 1,
        user: { id: 1, realName: 'X' },
      });

      await service.updateMyProfile(1, { dataVersion: 0, realName: 'X' } as any);

      const call = prisma.studentProfile.update.mock.calls[0][0] as any;
      expect(call.data.hukouUpdatedBy).toBeUndefined();
      expect(call.data.bonusUpdatedBy).toBeUndefined();
      expect(call.data.examLocationUpdatedBy).toBeUndefined();
    });
  });

  // ── updateMyProfile ─────────────────────────────────────

  describe('updateMyProfile', () => {
    it('包含 provincialRank 时抛 ForbiddenException（位次仅自动计算）', async () => {
      const dto = {
        dataVersion: 0,
        // ① teacher-only field
        provincialRank: 1000,
      };
      await expect(service.updateMyProfile(100, dto as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('包含 province 字段时正常通过（2026-05-06 重新放权给学生）', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, userId: 100, dataVersion: 0,
      });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1, userId: 100, province: '四川', dataVersion: 1,
        user: { id: 100, realName: '小王' },
      });
      const result = await service.updateMyProfile(100, {
        dataVersion: 0,
        province: '四川',
      } as any);
      expect(result).toHaveProperty('province', '四川');
    });

    it('包含 totalScore 字段时正常通过（②，学生自填）', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1, userId: 100, dataVersion: 0,
      });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1, userId: 100, totalScore: 600, dataVersion: 1,
        user: { id: 100, realName: '小王' },
      });
      const result = await service.updateMyProfile(100, {
        dataVersion: 0,
        totalScore: 600,
      } as any);
      expect(result).toHaveProperty('totalScore', 600);
    });

    it('正常字段写入成功', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue({
        id: 1,
        userId: 100,
        dataVersion: 0,
      });
      prisma.studentProfile.update.mockResolvedValue({
        id: 1,
        userId: 100,
        formFiller: 'STUDENT',
        dataVersion: 1,
        user: { id: 100, realName: '小王' },
      });

      const result = await service.updateMyProfile(100, {
        dataVersion: 0,
        formFiller: 'STUDENT',
      } as any);
      expect(prisma.studentProfile.update).toHaveBeenCalled();
      expect(result).toHaveProperty('formFiller', 'STUDENT');
    });

    it('档案不存在时抛 NotFoundException', async () => {
      prisma.studentProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMyProfile(999, { dataVersion: 0 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
