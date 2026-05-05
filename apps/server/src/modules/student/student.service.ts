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
import { TEACHER_ONLY_FIELDS } from './field-policy';

@Injectable()
export class StudentService {
  constructor(
    private prisma: PrismaService,
    private progressService: ProgressService,
  ) {}

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
   * Update student profile with optimistic locking.
   * Automatically calculates infoCompleteness and may upgrade status.
   */
  async updateProfile(id: number, dto: UpdateStudentProfileDto) {
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

    const updated = await this.prisma.studentProfile.update({
      where: { id },
      // bonusItems / preferredBatches 是 Json 列，DTO 用 class 做嵌套校验，
      // Prisma 期望 InputJsonValue — 在边界做一次断言交给 Prisma
      data: {
        ...(updateData as Prisma.StudentProfileUpdateInput),
        ...statusUpdate,
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
   * 学生本人更新自己的档案。拒绝任何 ① 字段（抛 ForbiddenException）。
   * 校验通过后委托给 updateProfile（含乐观锁）。
   */
  async updateMyProfile(userId: number, dto: UpdateStudentProfileDto) {
    // 拒绝 ① 字段：哪怕 dto 携带了一个 teacher-only 字段，也立刻拒绝（不静默忽略）
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
    return this.updateProfile(profile.id, dto);
  }
}
