import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { ProgressService } from './progress.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentStatus } from '@prisma/client';

// Mock bcrypt — keep hash deterministic for tests
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

describe('StudentService', () => {
  let service: StudentService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    studentProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      studentProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
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
          useValue: {
            scoreToRank: jest.fn().mockResolvedValue({
              year: 2026, examType: '物理', score: 600, rank: 28500, percentile: 0.04,
            }),
          },
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
    it('submitMyIntake marks a complete student intake as SUBMITTED', async () => {
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
        user: { id: 100, realName: '小王', phone: '13800000000', gender: 'MALE' },
      });
      prisma.studentProfile.update.mockResolvedValue({ id: 1, intakeStatus: 'SUBMITTED' });

      const result = await (service as any).submitMyIntake(100);

      expect(result).toHaveProperty('intakeStatus', 'SUBMITTED');
      expect(prisma.studentProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            intakeStatus: 'SUBMITTED',
            intakeSubmittedAt: expect.any(Date),
            intakeReviewComment: null,
          }),
        }),
      );
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
