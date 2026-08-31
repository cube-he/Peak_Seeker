import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayloadUser } from '../casl/types';

interface ListQuery {
  examYear?: number;
  examType?: 'PHYSICS' | 'HISTORY';
  batch?: string; // VolunteerPlan.batchName
  scoreFrom?: number;
  scoreTo?: number;
  keyword?: string; // 学生姓名 / 录取大学模糊匹配
  page?: number;
  pageSize?: number;
}

// 清洗 admissionResult: 若 admittedMinScore 缺失则 scoreDiff 也置 null.
// 原因: Excel 数据存在"无录取分但分差列填了总分"的脏数据, 没有 admittedMinScore
// 就没法定义有意义的分差; 显示出来 (如 +453) 反而误导.
function cleanScoreDiff<T extends { admissionResult: any | null }>(s: T): T {
  if (s.admissionResult && s.admissionResult.admittedMinScore == null) {
    s.admissionResult.scoreDiff = null;
  }
  return s;
}

@Injectable()
export class HistoricalCasesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 历史案例列表 (isArchived=true 学生) */
  async list(q: ListQuery) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = { isArchived: true };
    if (q.examYear) where.examYear = q.examYear;
    if (q.examType) where.examType = q.examType;
    if (q.scoreFrom != null || q.scoreTo != null) {
      where.totalScore = {};
      if (q.scoreFrom != null) where.totalScore.gte = q.scoreFrom;
      if (q.scoreTo != null) where.totalScore.lte = q.scoreTo;
    }
    if (q.keyword) {
      // 模糊匹配学生姓名 / 录取大学
      where.OR = [
        { user: { realName: { contains: q.keyword } } },
        { admissionResult: { admittedUniName: { contains: q.keyword } } },
      ];
    }
    if (q.batch) {
      where.admissionResult = {
        ...(where.admissionResult ?? {}),
        batchName: q.batch,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ totalScore: 'desc' }, { id: 'desc' }],
        include: {
          user: { select: { realName: true, username: true, gender: true, ethnicity: true } },
          admissionResult: true,
          teacher: { include: { user: { select: { realName: true, username: true } } } },
        },
      }),
      this.prisma.studentProfile.count({ where }),
    ]);

    return { data: data.map(cleanScoreDiff), total, page, pageSize };
  }

  /** 详情: 含 user / plan / admissionResult / attachments */
  async getById(id: number) {
    const student = await this.prisma.studentProfile.findFirst({
      where: { id, isArchived: true },
      include: {
        user: true,
        admissionResult: true,
        attachments: { orderBy: { category: 'asc' } },
        volunteerPlans: {
          where: { isHistorical: true },
          orderBy: { createdAt: 'desc' },
        },
        teacher: { include: { user: { select: { realName: true, username: true } } } },
      },
    });
    if (!student) throw new NotFoundException('历史案例不存在');
    return cleanScoreDiff(student);
  }

  /** 统计概览 */
  async stats(examYear?: number) {
    const where: any = { isArchived: true };
    if (examYear) where.examYear = examYear;

    const all = await this.prisma.studentProfile.findMany({
      where,
      include: { admissionResult: true },
    });

    const byExamType: Record<string, number> = { PHYSICS: 0, HISTORY: 0 };
    const byExamYear: Record<string, number> = {};
    const byBatch: Record<string, number> = {};
    const scoreDiffs: number[] = [];
    const uniNameCounts: Record<string, number> = {};

    for (const s of all) {
      if (s.examYear != null) {
        const year = String(s.examYear);
        byExamYear[year] = (byExamYear[year] ?? 0) + 1;
      }
      if (s.examType) byExamType[s.examType] = (byExamType[s.examType] ?? 0) + 1;
      const batch = s.admissionResult?.batchName ?? '未填';
      byBatch[batch] = (byBatch[batch] ?? 0) + 1;
      // 只统计有完整数据 (admittedMinScore 存在 + scoreDiff 不为 null) 的分差
      if (
        s.admissionResult?.scoreDiff != null &&
        s.admissionResult?.admittedMinScore != null
      ) {
        scoreDiffs.push(s.admissionResult.scoreDiff);
      }
      const uni = s.admissionResult?.admittedUniName;
      if (uni) uniNameCounts[uni] = (uniNameCounts[uni] ?? 0) + 1;
    }

    const topUniversities = Object.entries(uniNameCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const avgScoreDiff =
      scoreDiffs.length > 0
        ? Math.round((scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length) * 10) / 10
        : null;

    return {
      total: all.length,
      byExamType,
      byExamYear,
      byBatch,
      avgScoreDiff,
      sampleSize: scoreDiffs.length,
      topUniversities,
    };
  }

  /** 相似案例: 同 examType + 分数 ±20 + 位次 ±20% */
  async similar(p: { examType: 'PHYSICS' | 'HISTORY'; score?: number; rank?: number; limit?: number }) {
    const where: any = { isArchived: true, examType: p.examType };
    if (p.score != null) {
      where.totalScore = { gte: p.score - 20, lte: p.score + 20 };
    }
    if (p.rank != null) {
      const margin = Math.round(p.rank * 0.2);
      where.provincialRank = { gte: Math.max(1, p.rank - margin), lte: p.rank + margin };
    }
    return this.prisma.studentProfile.findMany({
      where,
      take: Math.min(20, p.limit ?? 10),
      orderBy: { provincialRank: 'asc' },
      include: {
        user: { select: { realName: true, gender: true } },
        admissionResult: true,
      },
    });
  }

  /** 附件下载 (教师共享历史案例；学生只能查看自己的附件) */
  async getAttachmentForDownload(
    attachmentId: number,
    requester: JwtPayloadUser,
  ) {
    const att = await this.prisma.studentAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        student: {
          include: {
            teacher: { include: { user: true } },
            user: true,
          },
        },
      },
    });
    if (!att) throw new NotFoundException('附件不存在');
    if (!att.student.isArchived) {
      throw new NotFoundException('附件不存在');
    }

    const isAdmin = requester.role === 'ADMIN';
    // 历史案例是教师共享资料，保持任意教师可查看的现有业务语义。
    const isTeacher = requester.role === 'TEACHER';
    const isStudentSelf =
      requester.role === 'STUDENT' &&
      (requester.studentProfileId === att.studentId ||
        requester.id === att.student.userId);
    if (!isAdmin && !isTeacher && !isStudentSelf) {
      throw new ForbiddenException('无权查看该附件');
    }
    return att;
  }
}
