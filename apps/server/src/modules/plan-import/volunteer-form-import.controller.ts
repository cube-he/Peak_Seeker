import {
  BadRequestException, Body, Controller, ForbiddenException, NotFoundException,
  Post, UploadedFile, UseGuards, UseInterceptors, Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VolunteerFormParserService } from './volunteer-form-parser.service';
import { VolunteerFormResolverService } from './volunteer-form-resolver.service';
import { StudentBatchMatcherService } from './student-batch-matcher.service';
import { VolunteerFormImportService } from './volunteer-form-import.service';
import { ResolvedGroup } from './volunteer-form.types';

const SUBJECTS_MAP: Record<string, string> = { PHYSICS: '物理', HISTORY: '历史' };

@UseGuards(JwtAuthGuard)
@Controller('plan-import/volunteer-form')
export class VolunteerFormImportController {
  constructor(
    private prisma: PrismaService,
    private parser: VolunteerFormParserService,
    private resolver: VolunteerFormResolverService,
    private matcher: StudentBatchMatcherService,
    private importSvc: VolunteerFormImportService,
  ) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @UploadedFile() file: any,
    @Req() req: any,
    @Body() body?: { studentId?: string | number },
  ) {
    if (!file?.buffer) throw new BadRequestException('未上传文件');
    // req.user.id is set by JwtStrategy.validate() which returns { id: payload.sub, ... }
    const actorUserId = req.user?.id;
    if (!actorUserId) throw new ForbiddenException('未登录');

    const text = await this.parser.extractPdfText(file.buffer);
    let parsed = this.isBlankText(text) ? null : this.parser.parseFormText(text);
    let parseSource: 'pdf-text' | 'ocr' = 'pdf-text';
    if (!parsed || parsed.volunteers.length === 0) {
      try {
        parsed = await this.parser.parsePdfWithOcr(file.buffer, file.originalname || 'volunteer-form.pdf');
        parseSource = 'ocr';
      } catch (e: any) {
        throw new BadRequestException(e?.message || 'OCR 未能识别该志愿表');
      }
    }
    if (parsed.volunteers.length === 0) {
      throw new BadRequestException('无法识别为志愿表：未识别到志愿条目。');
    }

    const requestedStudentId = this.parseOptionalPositiveInt(body?.studentId);
    const presetStudent = requestedStudentId
      ? await this.prisma.studentProfile.findFirst({
          where: { id: requestedStudentId, teacher: { userId: actorUserId } },
          include: { user: { select: { realName: true } } },
        })
      : null;
    if (requestedStudentId && !presetStudent) throw new ForbiddenException('无权操作该学生');

    const candidateStudents = presetStudent
      ? [presetStudent]
      : await this.matcher.findCandidateStudents(parsed.identity, actorUserId);
    const firstCandidate = candidateStudents[0] as any;
    const examType = parsed.examTypeHint ?? this.normalizeExamType(firstCandidate?.examType) ?? 'PHYSICS';
    const year = firstCandidate?.examYear ?? 2026;
    // 高考所在地省份, 不是户籍。批次/线/计划/录取/段表只有四川 (随迁子女户籍在外、
    // 在川高考的常态: StudentProfile.province 是户籍, 不能用来查批次)。志愿表 PDF
    // 本身写明是「四川省...考生志愿表」,该功能上下文锁定四川。
    const province = '四川';
    const bc = await this.matcher.matchBatchConfig(parsed.batch, examType, year, province);

    const groups = bc
      ? (await this.resolver.resolveGroups(parsed.volunteers, {
          year: (bc as any).year, subjects: SUBJECTS_MAP[examType], batch: (bc as any).batch,
        })).groups
      : [];
    const summary = bc
      ? { total: groups.length, matched: groups.filter((g: any) => g.status === 'matched').length, unmatched: groups.filter((g: any) => g.status === 'unmatched').length }
      : { total: parsed.volunteers.length, matched: 0, unmatched: parsed.volunteers.length };

    return {
      identity: parsed.identity, batch: parsed.batch, examTypeHint: examType,
      batchConfig: bc ? { id: (bc as any).id, batch: (bc as any).batch } : null,
      candidateStudents: candidateStudents.map((s: any) => ({ id: s.id, realName: s.user?.realName, classInfo: s.classInfo })),
      groups, summary, parseSource,
    };
  }

  private isBlankText(text: string | null | undefined) {
    return !text || text.replace(/\s/g, '').length === 0;
  }

  private parseOptionalPositiveInt(value: string | number | undefined) {
    if (value == null || value === '') return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  }

  private normalizeExamType(value: unknown): 'PHYSICS' | 'HISTORY' | undefined {
    if (value === 'PHYSICS' || value === 'HISTORY') return value;
    if (value === '物理' || value === '物理类') return 'PHYSICS';
    if (value === '历史' || value === '历史类') return 'HISTORY';
    return undefined;
  }

  @Post('commit')
  async commit(
    @Body() body: { studentId: number; batchConfigId: number; resolvedGroups: ResolvedGroup[]; versionNote?: string },
    @Req() req: any,
  ) {
    // req.user.id is set by JwtStrategy.validate() which returns { id: payload.sub, ... }
    const actorUserId = req.user?.id;
    if (!actorUserId) throw new ForbiddenException('未登录');
    if (!body?.studentId || !body?.batchConfigId || !Array.isArray(body?.resolvedGroups)) {
      throw new BadRequestException('参数缺失');
    }
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: body.studentId },
      include: { teacher: { select: { userId: true } } },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if ((student as any).teacher?.userId !== actorUserId) throw new ForbiddenException('无权操作该学生');

    const plan = await this.importSvc.commit({
      studentId: body.studentId,
      batchConfigId: body.batchConfigId,
      resolvedGroups: body.resolvedGroups,
      actorUserId,
      versionNote: body.versionNote,
    });
    return {
      planId: (plan as any).id,
      versionNo: (plan as any).versionNo,
      importedCount: (plan as any).importedCount,
      failures: (plan as any).failures,
    };
  }
}
