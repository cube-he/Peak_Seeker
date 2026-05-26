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
import {
  TEACHER_ONLY_FIELDS,
  FIELD_TO_PROVENANCE_GROUP,
  USER_LEVEL_FIELDS,
} from './field-policy';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import type { ExamType } from '../score-segment/exam-type.helper';

const USER_LEVEL_FIELD_SET = new Set<string>(USER_LEVEL_FIELDS);
const TEMPORARY_RANK_FALLBACK_YEAR = 2025;

export interface RankCheck {
  calculatedRank: number | null;
  currentRank: number | null;
  isMismatch: boolean;
  difference: number | null;
  requestedYear: number | null;
  sourceYear: number | null;
  isEstimated: boolean;
  source: 'score-segment' | 'missing-input' | 'unavailable';
}

interface RankComputation {
  rank: number;
  requestedYear: number;
  sourceYear: number;
}

export type WorkflowStatus =
  | 'COLLECTING'
  | 'GENERATING'
  | 'REVIEWING'
  | 'FINALIZED'
  | 'SUBMITTED';

/**
 * 教师工作流状态派生
 * 优先以最新方案状态为准，无方案则看资料采集状态。
 * 见 student/page.tsx 和 dashboard/page.tsx 的状态使用方。
 */
export function deriveWorkflowStatus(
  intakeStatus: string | null | undefined,
  latestPlanStatus: string | null | undefined,
): WorkflowStatus {
  switch (latestPlanStatus) {
    case 'PUBLISHED':
      return 'SUBMITTED';
    case 'FINALIZED':
    case 'APPROVED':
    case 'PARENT_CONFIRMED':
      return 'FINALIZED';
    case 'PENDING_REVIEW':
    case 'REVIEWING':
      return 'REVIEWING';
    case 'DRAFT':
    case 'REJECTED':
    case 'OUTDATED':
      return 'GENERATING';
    default:
      break;
  }
  if (intakeStatus === 'SUBMITTED') return 'REVIEWING';
  if (intakeStatus === 'VERIFIED') return 'GENERATING';
  return 'COLLECTING';
}

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
   * 2026 一分一段未发布前，先尝试 2026，缺表时临时用 2025 作为校验来源。
   */
  private async tryComputeRank(
    examType: string | null | undefined,
    examYear: number | null | undefined,
    totalScore: number | null | undefined,
  ): Promise<RankComputation | null> {
    if (totalScore == null || !examType || !examYear) return null;
    const mapped = this.mapExamTypeForRank(examType);
    if (!mapped) return null;

    const primary = await this.tryComputeRankForYear(examYear, mapped, totalScore, examYear);
    if (primary) return primary;

    if (examYear === 2026) {
      return this.tryComputeRankForYear(
        TEMPORARY_RANK_FALLBACK_YEAR,
        mapped,
        totalScore,
        examYear,
      );
    }

    return null;
  }

  private async tryComputeRankForYear(
    sourceYear: number,
    examType: ExamType,
    totalScore: number,
    requestedYear: number,
  ): Promise<RankComputation | null> {
    try {
      const r = await this.scoreSegmentService.scoreToRank(sourceYear, examType, totalScore);
      return { rank: r.rank, requestedYear, sourceYear: r.year };
    } catch {
      // 一分一段表缺数据 / 分数越界等：静默失败，留位次为空
      return null;
    }
  }

  private makeRankCheck(
    currentRank: number | null | undefined,
    calculatedRank: number | null,
    source: RankCheck['source'],
    requestedYear: number | null = null,
    sourceYear: number | null = null,
  ): RankCheck {
    const normalizedCurrent = currentRank ?? null;
    const difference =
      normalizedCurrent != null && calculatedRank != null
        ? normalizedCurrent - calculatedRank
        : null;

    return {
      calculatedRank,
      currentRank: normalizedCurrent,
      isMismatch: difference != null && difference !== 0,
      difference,
      requestedYear,
      sourceYear,
      isEstimated: source === 'score-segment' && requestedYear != null && sourceYear != null && requestedYear !== sourceYear,
      source,
    };
  }

  private async computeRankCheck(profile: {
    examType?: string | null;
    examYear?: number | null;
    totalScore?: number | null;
    provincialRank?: number | null;
  }): Promise<RankCheck> {
    const currentRank = profile.provincialRank ?? null;
    if (profile.totalScore == null || !profile.examType || !profile.examYear) {
      return this.makeRankCheck(currentRank, null, 'missing-input', profile.examYear ?? null);
    }

    const rankComputation = await this.tryComputeRank(
      profile.examType,
      profile.examYear,
      profile.totalScore,
    );

    return this.makeRankCheck(
      currentRank,
      rankComputation?.rank ?? null,
      rankComputation == null ? 'unavailable' : 'score-segment',
      profile.examYear,
      rankComputation?.sourceYear ?? null,
    );
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
    const {
      status,
      keyword,
      page = 1,
      pageSize = 20,
      assignmentStatus,
      teacherProfileId: assignedTeacherProfileId,
    } = query;

    const where: Prisma.StudentProfileWhereInput = {};

    if (teacherProfileId !== undefined) {
      where.teacherId = teacherProfileId;
    } else if (assignedTeacherProfileId) {
      where.teacherId = assignedTeacherProfileId;
    } else if (assignmentStatus === 'UNASSIGNED') {
      where.teacherId = null;
    } else if (assignmentStatus === 'ASSIGNED') {
      where.teacherId = { not: null };
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
          // 列表派生 workflowStatus / 「方案」列需要最新方案 + 总数
          volunteerPlans: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { id: true, status: true, updatedAt: true, versionNo: true },
          },
          _count: {
            select: { volunteerPlans: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    // 列表也需要 progress 显示双进度列 + 筛选
    const dataWithProgress = data.map((p) => {
      const latestPlan = p.volunteerPlans[0];
      return {
        ...p,
        progress: this.progressService.compute({
          ...p,
          realName: (p as any).user?.realName,
          phone: (p as any).user?.phone,
          gender: (p as any).user?.gender,
          ethnicity: (p as any).user?.ethnicity,
        }),
        workflowStatus: deriveWorkflowStatus(p.intakeStatus, latestPlan?.status),
        planCount: p._count.volunteerPlans,
        latestPlanStatus: latestPlan?.status ?? null,
        latestPlanId: latestPlan?.id ?? null,
        latestPlanVersionNo: latestPlan?.versionNo ?? null,
      };
    });

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
        volunteerPlans: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, updatedAt: true, versionNo: true },
        },
        _count: {
          select: { volunteerPlans: true },
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

    const rankCheck = await this.computeRankCheck(profile);

    const latestPlan = profile.volunteerPlans[0];

    return {
      ...profile,
      progress,
      rankCheck,
      workflowStatus: deriveWorkflowStatus(profile.intakeStatus, latestPlan?.status),
      planCount: profile._count.volunteerPlans,
      latestPlanStatus: latestPlan?.status ?? null,
      latestPlanId: latestPlan?.id ?? null,
      latestPlanVersionNo: latestPlan?.versionNo ?? null,
    };
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

  private splitUserLevelUpdates(dto: Record<string, any>) {
    const profileUpdates: Record<string, any> = {};
    const userUpdates: Record<string, any> = {};

    for (const [key, value] of Object.entries(dto)) {
      if (USER_LEVEL_FIELD_SET.has(key)) {
        userUpdates[key] = value;
      } else {
        profileUpdates[key] = value;
      }
    }

    return { profileUpdates, userUpdates };
  }

  /**
   * Update student profile with optimistic locking.
   * Automatically calculates infoCompleteness and may upgrade status.
   */
  async updateProfile(id: number, dto: UpdateStudentProfileDto, actor: 'student' | 'teacher' = 'teacher') {
    const { dataVersion, ...rawUpdateData } = dto as Record<string, any>;
    const { profileUpdates: updateData, userUpdates } =
      this.splitUserLevelUpdates(rawUpdateData);

    // Optimistic lock: only update if dataVersion matches
    const current = await this.prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            realName: true,
            phone: true,
            gender: true,
            ethnicity: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('学生不存在');
    }

    // dataVersion 缺失（auto-save 单字段保存）时跳过乐观锁；显式传入时严格校验
    if (dataVersion !== undefined && current.dataVersion !== dataVersion) {
      throw new ConflictException(
        '数据已被其他人修改，请刷新后重试',
      );
    }

    // Merge current + incoming to calculate completeness on the resulting state
    const merged = {
      ...current,
      realName: current.user?.realName,
      phone: current.user?.phone,
      gender: current.user?.gender,
      ethnicity: current.user?.ethnicity,
      ...updateData,
      ...userUpdates,
    };
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
    let rankCheck = await this.computeRankCheck(merged);
    const scoreOrTypeChanged =
      updateData.totalScore !== undefined ||
      updateData.examType !== undefined ||
      updateData.examYear !== undefined;
    const rankSubmitted = updateData.provincialRank !== undefined;
    if (scoreOrTypeChanged && !rankSubmitted) {
      const computed = await this.tryComputeRank(
        merged.examType,
        merged.examYear,
        merged.totalScore,
      );
      // 查到 → 写回；查不到 → 不动 provincialRank（保留老师可能已手填的值）。
      // 选项 a：若需要"分数缺失即清空位次"，可改为 rankUpdate.provincialRank = computed;
      if (computed !== null) {
        rankUpdate.provincialRank = computed.rank;
        rankCheck = this.makeRankCheck(
          rankUpdate.provincialRank,
          computed.rank,
          'score-segment',
          computed.requestedYear,
          computed.sourceYear,
        );
      }
    }

    const provenance = this.computeProvenanceUpdates(updateData, actor);
    const hasUserUpdates = Object.keys(userUpdates).length > 0;

    const updated = await this.prisma.studentProfile.update({
      where: { id },
      // bonusItems / preferredBatches 是 Json 列，DTO 用 class 做嵌套校验，
      // Prisma 期望 InputJsonValue — 在边界做一次断言交给 Prisma
      data: {
        ...(updateData as Prisma.StudentProfileUpdateInput),
        ...(hasUserUpdates ? { user: { update: userUpdates } } : {}),
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
            phone: true,
            gender: true,
            ethnicity: true,
          },
        },
      },
    });

    return { ...updated, infoCompleteness: completeness, rankCheck };
  }

  /**
   * Reassign a student to a different teacher.
   */
  async assignTeacher(studentId: number, teacherProfileId: number | null) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });

    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    if (teacherProfileId !== null) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { id: teacherProfileId },
      });

      if (!teacher) {
        throw new NotFoundException('教师不存在');
      }
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
    // 把 User 上的字段铺平到顶层（autosave/section 组件按 fieldKey 平面访问，不再走 profile.user.*）
    return {
      ...filtered,
      realName: profile.user.realName,
      phone: profile.user.phone,
      gender: profile.user.gender,
      ethnicity: profile.user.ethnicity,
      progress,
    };
  }

  /**
   * 学生本人更新自己的档案。
   * - 拒绝 ① TEACHER_ONLY_FIELDS（仅 provincialRank）
   * - 接受 STUDENT_NEWLY_WRITABLE 9 个字段，写入 hukou/bonus/examLocation provenance
   * - 委托 updateProfile 持久化（含乐观锁）
   */
  async submitMyIntake(userId: number) {
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
          },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('学生档案不存在');
    }

    const progress = this.progressService.compute({
      ...profile,
      realName: profile.user.realName,
      phone: profile.user.phone,
      gender: profile.user.gender,
      ethnicity: profile.user.ethnicity,
    });
    if (!progress.stageProgress.stage1.completed) {
      throw new ConflictException('核心资料未填写完整，暂不能提交给老师确认');
    }

    return this.prisma.studentProfile.update({
      where: { id: profile.id },
      data: {
        intakeStatus: 'SUBMITTED',
        intakeSubmittedAt: new Date(),
        intakeReviewedAt: null,
        intakeReviewedBy: null,
        intakeReviewComment: null,
      },
    });
  }

  async reviewIntake(
    studentId: number,
    opts: {
      teacherProfileId?: number;
      reviewerUserId: number;
      action: 'VERIFY' | 'REQUEST_CHANGE';
      comment?: string;
    },
  ) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
    });
    if (!profile) {
      throw new NotFoundException('学生不存在');
    }
    if (opts.teacherProfileId && profile.teacherId !== opts.teacherProfileId) {
      throw new ForbiddenException('无权审核不属于自己的学生资料');
    }

    const nextStatus = opts.action === 'VERIFY' ? 'VERIFIED' : 'NEEDS_CHANGES';
    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        intakeStatus: nextStatus,
        intakeReviewedAt: new Date(),
        intakeReviewedBy: opts.reviewerUserId,
        intakeReviewComment: opts.comment ?? null,
      },
    });
  }

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
