import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { RequestConsultationDto } from './dto/request-consultation.dto';

@Injectable()
export class ConsultationService {
  constructor(private prisma: PrismaService) {}

  private async resolveTeacherId(userId: number): Promise<number> {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId },
    });
    if (!teacher) throw new ForbiddenException('当前用户没有老师档案');
    return teacher.id;
  }

  async create(userId: number, dto: CreateConsultationDto) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.create({
      data: {
        studentId: dto.studentId,
        teacherId,
        scheduledAt: new Date(dto.scheduledAt),
        durationEst: dto.durationEst,
        channel: dto.channel,
        purpose: dto.purpose,
        notes: dto.notes,
        status: 'scheduled',
      },
    });
  }

  async update(userId: number, id: number, dto: UpdateConsultationDto) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权修改该预约');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.durationEst !== undefined && { durationEst: dto.durationEst }),
        ...(dto.channel && { channel: dto.channel }),
        ...(dto.purpose !== undefined && { purpose: dto.purpose }),
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async start(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    });
  }

  async end(userId: number, id: number, notes?: string) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    const endedAt = new Date();
    const durationAct = appt.startedAt
      ? Math.round((endedAt.getTime() - appt.startedAt.getTime()) / 60000)
      : null;

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'completed',
        endedAt,
        durationAct,
        ...(notes !== undefined && { notes }),
      },
    });
  }

  async listByStudent(userId: number, studentId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.findMany({
      where: { studentId, teacherId },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async listToday(userId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

    return this.prisma.consultationAppointment.findMany({
      where: {
        teacherId,
        scheduledAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      include: {
        student: {
          include: {
            user: { select: { realName: true, username: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async requestByParent(userId: number, dto: RequestConsultationDto) {
    const studentProfile = await this.prisma.studentProfile.findFirst({
      where: { userId },
    });
    if (!studentProfile) throw new ForbiddenException('当前用户没有学生档案');
    if (!studentProfile.teacherId) throw new ForbiddenException('该学生未关联老师,无法申请预约');

    return this.prisma.consultationAppointment.create({
      data: {
        studentId: studentProfile.id,
        teacherId: studentProfile.teacherId,
        scheduledAt: new Date(dto.scheduledAt),
        durationEst: dto.durationEst,
        channel: dto.channel,
        purpose: dto.purpose,
        notes: dto.notes,
        status: 'requested',
        createdByActor: 'student',
      },
    });
  }

  async confirmRequest(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');
    if (appt.status !== 'requested') throw new ForbiddenException('当前状态不可确认');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: { status: 'scheduled' },
    });
  }

  async rejectRequest(userId: number, id: number, reason?: string) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        notes: reason ? `[已拒绝] ${reason}` : `[已拒绝]`,
      },
    });
  }

  async listPendingRequests(userId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    return this.prisma.consultationAppointment.findMany({
      where: { teacherId, status: 'requested' },
      include: {
        student: {
          include: { user: { select: { realName: true, username: true } } },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async listMine(userId: number) {
    const studentProfile = await this.prisma.studentProfile.findFirst({
      where: { userId },
    });
    if (!studentProfile) throw new ForbiddenException('当前用户没有学生档案');

    return this.prisma.consultationAppointment.findMany({
      where: { studentId: studentProfile.id },
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async remove(userId: number, id: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权删除');

    await this.prisma.consultationAppointment.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * 老师个人复盘:按周/月统计沟通次数、总时长、按学生分布、按沟通类型分布、预估 vs 实际偏差。
   */
  async getMyInsights(userId: number, range: 'week' | 'month' = 'month') {
    const teacherId = await this.resolveTeacherId(userId);
    const now = new Date();
    const start = new Date(now);
    if (range === 'week') {
      start.setDate(now.getDate() - 7);
    } else {
      start.setMonth(now.getMonth() - 1);
    }

    const completed = await this.prisma.consultationAppointment.findMany({
      where: {
        teacherId,
        status: 'completed',
        endedAt: { gte: start },
      },
      include: {
        student: {
          include: { user: { select: { realName: true, username: true } } },
        },
      },
    });

    const totalCount = completed.length;
    const totalMinutes = completed.reduce((acc, c) => acc + (c.durationAct ?? 0), 0);

    const byStudentMap = new Map<number, { name: string; count: number; minutes: number }>();
    for (const c of completed) {
      const sid = c.studentId;
      const name = c.student?.user?.realName ?? c.student?.user?.username ?? `学生${sid}`;
      const cur = byStudentMap.get(sid) ?? { name, count: 0, minutes: 0 };
      cur.count += 1;
      cur.minutes += c.durationAct ?? 0;
      byStudentMap.set(sid, cur);
    }
    const byStudent = Array.from(byStudentMap.entries())
      .map(([studentId, v]) => ({ studentId, ...v }))
      .sort((a, b) => b.minutes - a.minutes);

    const byChannel: Record<string, { count: number; minutes: number }> = {};
    for (const c of completed) {
      const k = c.channel;
      if (!byChannel[k]) byChannel[k] = { count: 0, minutes: 0 };
      byChannel[k].count += 1;
      byChannel[k].minutes += c.durationAct ?? 0;
    }

    const withBoth = completed.filter((c) => c.durationEst != null && c.durationAct != null);
    const avgEst = withBoth.length
      ? Math.round(withBoth.reduce((a, c) => a + (c.durationEst ?? 0), 0) / withBoth.length)
      : null;
    const avgAct = withBoth.length
      ? Math.round(withBoth.reduce((a, c) => a + (c.durationAct ?? 0), 0) / withBoth.length)
      : null;

    return {
      range,
      totalCount,
      totalMinutes,
      byStudent,
      byChannel,
      estimation: { avgEst, avgAct, sampleSize: withBoth.length },
    };
  }

  /**
   * 坐诊模式 - 取号:为今天某个学生的预约分配 queueNumber(同一老师同一天递增)。
   */
  async enqueue(userId: number, appointmentId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const appt = await this.prisma.consultationAppointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appt) throw new NotFoundException('预约不存在');
    if (appt.teacherId !== teacherId) throw new ForbiddenException('无权操作');
    if (appt.queueNumber != null) return appt;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86_400_000);
    const max = await this.prisma.consultationAppointment.aggregate({
      where: {
        teacherId,
        scheduledAt: { gte: start, lt: end },
        queueNumber: { not: null },
      },
      _max: { queueNumber: true },
    });
    const next = (max._max.queueNumber ?? 0) + 1;

    return this.prisma.consultationAppointment.update({
      where: { id: appointmentId },
      data: { queueNumber: next, queuedAt: new Date() },
    });
  }

  /**
   * 坐诊面板:获取今天的队列状态
   */
  async getClinicState(userId: number) {
    const teacherId = await this.resolveTeacherId(userId);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 86_400_000);

    const all = await this.prisma.consultationAppointment.findMany({
      where: {
        teacherId,
        scheduledAt: { gte: start, lt: end },
        queueNumber: { not: null },
      },
      include: {
        student: {
          include: { user: { select: { realName: true, username: true } } },
        },
      },
      orderBy: { queueNumber: 'asc' },
    });

    const inProgress = all.find((a) => a.status === 'in_progress') ?? null;
    const waiting = all.filter(
      (a) => a.status === 'scheduled' && a.id !== inProgress?.id,
    );
    const done = all.filter((a) => a.status === 'completed');

    return { inProgress, waiting, done };
  }

  /**
   * 坐诊面板 - 叫下一号:事务内结束当前 + 启动队列第一个等待的
   */
  async callNext(userId: number, currentNotes?: string) {
    const teacherId = await this.resolveTeacherId(userId);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.consultationAppointment.findFirst({
        where: { teacherId, status: 'in_progress' },
      });
      if (current) {
        const endedAt = new Date();
        const durationAct = current.startedAt
          ? Math.round((endedAt.getTime() - current.startedAt.getTime()) / 60000)
          : null;
        await tx.consultationAppointment.update({
          where: { id: current.id },
          data: {
            status: 'completed',
            endedAt,
            durationAct,
            ...(currentNotes !== undefined && { notes: currentNotes }),
          },
        });
      }

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
      const next = await tx.consultationAppointment.findFirst({
        where: {
          teacherId,
          status: 'scheduled',
          queueNumber: { not: null },
          scheduledAt: { gte: startOfDay, lt: endOfDay },
        },
        orderBy: { queueNumber: 'asc' },
      });

      if (next) {
        await tx.consultationAppointment.update({
          where: { id: next.id },
          data: {
            status: 'in_progress',
            startedAt: new Date(),
            calledAt: new Date(),
          },
        });
      }

      return { endedId: current?.id, startedId: next?.id };
    });
  }

  /**
   * 主管报表:所有老师的工时榜 + 异常告警(产量偏低)。需要主管权限。
   */
  async getTeamInsights(userId: number, range: 'week' | 'month' = 'month') {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId },
    });
    if (!teacher?.isSupervisor) throw new ForbiddenException('需要主管权限');

    const now = new Date();
    const start = new Date(now);
    if (range === 'week') start.setDate(now.getDate() - 7);
    else start.setMonth(now.getMonth() - 1);

    const completed = await this.prisma.consultationAppointment.findMany({
      where: {
        status: 'completed',
        endedAt: { gte: start },
      },
      include: {
        teacher: {
          include: { user: { select: { realName: true, username: true } } },
        },
      },
    });

    const byTeacherMap = new Map<
      number,
      { name: string; count: number; minutes: number; studentSet: Set<number> }
    >();
    for (const c of completed) {
      const tid = c.teacherId;
      const name = c.teacher?.user?.realName ?? c.teacher?.user?.username ?? `老师${tid}`;
      const cur = byTeacherMap.get(tid) ?? {
        name,
        count: 0,
        minutes: 0,
        studentSet: new Set<number>(),
      };
      cur.count += 1;
      cur.minutes += c.durationAct ?? 0;
      cur.studentSet.add(c.studentId);
      byTeacherMap.set(tid, cur);
    }

    const byTeacher = Array.from(byTeacherMap.entries())
      .map(([teacherId, v]) => ({
        teacherId,
        name: v.name,
        count: v.count,
        minutes: v.minutes,
        studentCount: v.studentSet.size,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const lowProductivityThresholdMinutes = range === 'week' ? 60 : 240;
    const lowProductivity = byTeacher.filter((t) => t.minutes < lowProductivityThresholdMinutes);

    return {
      range,
      totalTeachers: byTeacher.length,
      totalCount: completed.length,
      totalMinutes: completed.reduce((a, c) => a + (c.durationAct ?? 0), 0),
      byTeacher,
      alerts: {
        lowProductivity: lowProductivity.map((t) => ({
          teacherId: t.teacherId,
          name: t.name,
          minutes: t.minutes,
        })),
        threshold: lowProductivityThresholdMinutes,
      },
    };
  }
}
