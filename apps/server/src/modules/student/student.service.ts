import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { Role, StudentStatus, Prisma } from '@prisma/client';
import { ProgressService } from './progress.service';
import { TEACHER_ONLY_FIELDS, FIELD_TO_PROVENANCE_GROUP } from './field-policy';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import type { ExamType } from '../score-segment/exam-type.helper';

@Injectable()
export class StudentService {
  constructor(
    private prisma: PrismaService,
    private progressService: ProgressService,
    private scoreSegmentService: ScoreSegmentService,
  ) {}

  /**
   * 把 Prisma NewExamType 枚举映射成 ScoreSegment 用的中文 ExamType。
   * 不支持的旧值（COMPREHENSIVE_*）返回 null —— 一分一段表只覆盖物理/历史/理科/文科。
   */
  private mapExamTypeForRank(examType: string | null | undefined): ExamType | null {
    if (!examType) return null;
    if (examType === 'PHYSICS') return '物理';
    if (examType === 'HISTORY') return '历史';
    if (examType === 'COMPREHENSIVE_SCIENCE') return '理科';
    if (examType === 'COMPREHENSIVE_LIBERAL') return '文科';
    return null;
  }

  /**
   * 学生改了总分/科类时，用 score-segment 自动算位次写回 provincialRank。
   * 查不到（数据缺失/科类不支持）→ 返回 null（由调用方决定是否清空 provincialRank）。
   */
  private async tryComputeRank(
    examType: string | null | undefined,
    examYear: number | null | undefined,
    totalScore: number | null | undefined,
  ): Promise<number | null> {
    if (!totalScore || !examType || !examYear) return null;
    const mapped = this.mapExamTypeForRank(examType);
    if (!mapped) return null;
    try {
      const r = await this.scoreSegmentService.scoreToRank(examYear, mapped, totalScore);
      return r.rank;
    } catch {
      // 一分一段表缺数据 / 分数越界等：静默失败，留位次为空
      return null;
    }
  }

  /**
   * Create a student account (User + StudentProfile) assigned to a teacher.
   */
  async create(teacherProfileId: number, dto: CreateStudentDto) {
    // Check username uniqueness
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        realName: dto.realName,
        phone: dto.phone,
        gender: dto.gender,
        ethnicity: dto.ethnicity,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            teacherId: teacherProfileId,
            highSchool: dto.highSchool,
            classInfo: dto.classInfo,
            city: dto.city,
            examYear: dto.examYear,
            status: StudentStatus.ACTIVE,
          },
        },
      },
      include: {
        studentProfile: true,
      },
    });
  }

  /**
   * Paginated query for students belonging to a teacher.
   * Admin callers pass teacherProfileId = undefined to see all.
   */
  async findByTeacher(
    teacherProfileId: number | undefined,
    query: QueryStudentDto,
  ) {
    const { status, keyword, page = 1, pageSize = 20 } = query;

    const where: Prisma.StudentProfileWhereInput = {};

    if (teacherProfileId !== undefined) {
      where.teacherId = teacherProfileId;
    }

    if (status) {
      where.status = status;
    }

    if (keyword) {
      where.user = {
        OR: [
          { realName: { contains: keyword } },
          { username: { contains: keyword } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              realName: true,
              phone: true,
              gender: true,
              ethnicity: true,
              createdAt: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    // 列表也需要 progress 显示双进度列 + 筛选
    const dataWithProgress = data.map((p) => ({
      ...p,
      progress: this.progressService.compute({
        ...p,
        realName: (p as any).user?.realName,
        phone: (p as any).user?.phone,
        gender: (p as any).user?.gender,
        ethnicity: (p as any).user?.ethnicity,
      }),
    }));

    return { data: dataWithProgress, total, page, pageSize };
  }

  /**
   * Get a single student profile with user info and teacher info.
   */
  async findById(id: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            gender: true,
            ethnicity: true,
            createdAt: true,
          },
        },
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    // 注入双轨完整度信息（老师端用于显示双进度条 + recommend gate）
    const progress = this.progressService.compute({
      ...profile,
      realName: profile.user?.realName,
      phone: profile.user?.phone,
      gender: profile.user?.gender,
      ethnicity: profile.user?.ethnicity,
    });

    return { ...profile, progress };
  }

  /**
   * Compute provenance updates to merge into a PATCH payload.
   * Maps incoming fields to {hukou,bonus,examLocation}UpdatedBy/At pairs.
   */
  private computeProvenanceUpdates(
    dto: Record<string, any>,
    actor: 'student' | 'teacher',
  ): Record<string, any> {
    const groups = new Set<string>();
    for (const key of Object.keys(dto)) {
      const group = (FIELD_TO_PROVENANCE_GROUP as Record<string, string>)[key];
      if (group) groups.add(group);
    }
    const now = new Date();
    const out: Record<string, any> = {};
    for (const g of groups) {
      out[`${g}UpdatedBy`] = actor;
      out[`${g}UpdatedAt`] = now;
    }
    return out;
  }

  /**
   * Update student profile with optimistic locking.
   * Automatically calculates infoCompleteness and may upgrade status.
   */
  async updateProfile(id: number, dto: UpdateStudentProfileDto, actor: 'student' | 'teacher' = 'teacher') {
    const { dataVersion, ...updateData } = dto;

    // Optimistic lock: only update if dataVersion matches
    const current = await this.prisma.studentProfile.findUnique({
      where: { id },
    });

    if (!current) {
      throw new NotFoundException('学生不存在');
    }

    if (current.dataVersion !== dataVersion) {
      throw new ConflictException(
        '数据已被其他人修改，请刷新后重试',
      );
    }

    // Merge current + incoming to calculate completeness on the resulting state
    const merged = { ...current, ...updateData };
    const completeness = this.calculateCompleteness(merged);

    // Auto-update status to ACTIVE if info completeness >= 80% and currently ACTIVE
    const statusUpdate: Record<string, any> = {};
    if (completeness >= 80 && current.status === StudentStatus.ACTIVE) {
      // Keep ACTIVE — the status already reflects a valid student
    }

    // 自动计算 provincialRank：当 totalScore / examType / examYear 任一变化时
    // 都用最新组合查一分一段表。学生本人不能在 dto 里直接写 provincialRank（被 STUDENT
    // updateMyProfile 的字段白名单挡住），但这里是统一的写入路径，老师改也会触发。
    const rankUpdate: { provincialRank?: number | null } = {};
    const scoreOrTypeChanged =
      updateData.totalScore !== undefined ||
      updateData.examType !== undefined ||
      updateData.examYear !== undefined;
    if (scoreOrTypeChanged) {
      const computed = await this.tryComputeRank(
        merged.examType,
        merged.examYear,
        merged.totalScore,
      );
      // 查到 → 写回；查不到 → 不动 provincialRank（保留老师可能已手填的值）。
      // 选项 a：若需要"分数缺失即清空位次"，可改为 rankUpdate.provincialRank = computed;
      if (computed !== null) {
        rankUpdate.provincialRank = computed;
      }
    }

    const provenance = this.computeProvenanceUpdates(updateData as Record<string, any>, actor);

    const updated = await this.prisma.studentProfile.update({
      where: { id },
      // bonusItems / preferredBatches 是 Json 列，DTO 用 class 做嵌套校验，
      // Prisma 期望 InputJsonValue — 在边界做一次断言交给 Prisma
      data: {
        ...(updateData as Prisma.StudentProfileUpdateInput),
        ...statusUpdate,
        ...rankUpdate,
        ...provenance,
        dataVersion: { increment: 1 },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    return { ...updated, infoCompleteness: completeness };
  }

  /**
   * Reassign a student to a different teacher.
   */
  async assignTeacher(studentId: number, teacherProfileId: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });

    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: { teacherId: teacherProfileId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        teacher: {
          include: {
            user: {
              select: { id: true, realName: true },
            },
          },
        },
      },
    });
  }

  /**
   * @deprecated 用 ProgressService.compute() 替代。
   * 本方法保留旧签名以兼容现有调用方，内部委托给新双轨算法的 overallCompleteness。
   */
  calculateCompleteness(profile: Record<string, any>): number {
    return this.progressService.compute(profile).overallCompleteness;
  }

  /**
   * 学生本人查询自己的档案。
   * 自动过滤掉 ① TEACHER_ONLY_FIELDS（学生看不到总分/位次/加分/户籍/高考所在地）。
   * 返回 progress 字段（双轨完整度 + stageProgress + isRecommendable）。
   */
  async getMyProfile(userId: number) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            gender: true,
            ethnicity: true,
            createdAt: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('学生档案不存在');
    }

    // 把 User 上的字段铺平进 progress 输入（progress 算法看 STAGE_1 包括 realName/phone/gender 等 User 级字段）
    const progress = this.progressService.compute({
      ...profile,
      realName: profile.user.realName,
      phone: profile.user.phone,
      gender: profile.user.gender,
      ethnicity: profile.user.ethnicity,
    });

    // 过滤 ① 字段（学生不可见）
    const teacherOnlySet = new Set<string>(TEACHER_ONLY_FIELDS);
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(profile)) {
      if (!teacherOnlySet.has(k)) {
        filtered[k] = v;
      }
    }
    return { ...filtered, progress };
  }

  /**
   * 学生本人更新自己的档案。
   * - 拒绝 ① TEACHER_ONLY_FIELDS（仅 provincialRank）
   * - 接受 STUDENT_NEWLY_WRITABLE 9 个字段，写入 hukou/bonus/examLocation provenance
   * - 委托 updateProfile 持久化（含乐观锁）
   */
  async updateMyProfile(userId: number, dto: UpdateStudentProfileDto) {
    for (const f of TEACHER_ONLY_FIELDS) {
      if ((dto as Record<string, any>)[f] !== undefined) {
        throw new ForbiddenException(`字段 ${f} 仅老师可修改`);
      }
    }

    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('学生档案不存在');
    }
    return this.updateProfile(profile.id, dto, 'student');
  }
}
