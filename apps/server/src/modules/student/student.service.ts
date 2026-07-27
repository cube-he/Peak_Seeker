import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { SaveAdmissionResultDto } from './dto/save-admission-result.dto';
import { Role, StudentStatus, Prisma } from '@prisma/client';
import { ProgressService } from './progress.service';
import { eligibleLevelFromScore } from './eligible-level';
import { TEACHER_ONLY_FIELDS, FIELD_TO_PROVENANCE_GROUP, USER_LEVEL_FIELDS } from './field-policy';
import { ScoreSegmentService } from '../score-segment/score-segment.service';
import type { ExamType } from '../score-segment/exam-type.helper';
import type { JwtPayloadUser } from '../casl/types';
import { TRACKED_FIELD_KEYS, serializeFieldValue, valuesEqual } from './student-change-log.config';

const USER_LEVEL_FIELD_SET = new Set<string>(USER_LEVEL_FIELDS);
const TEMPORARY_RANK_FALLBACK_YEAR = 2025;
export const STUDENT_ATTACHMENT_CATEGORIES = [
  'consultation',
  'submission_screenshot',
  'admission_proof',
  'other',
] as const;
export type StudentAttachmentCategory = (typeof STUDENT_ATTACHMENT_CATEGORIES)[number];
export const MAX_STUDENT_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;

const STUDENT_ATTACHMENT_CATEGORY_SET = new Set<string>(STUDENT_ATTACHMENT_CATEGORIES);
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.webp', '.gif']);
const EXTENSION_MIME_TYPE: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const MIME_TYPE_ALIASES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};
const MIME_TYPE_CANONICAL_EXTENSION: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const GENERIC_ATTACHMENT_MIME_TYPES = new Set(['', 'application/octet-stream']);

interface ValidatedAttachmentFormat {
  mimeType: string;
  extension: string;
}

interface AttachmentQuarantineSource {
  sourcePath: string;
  allowDirectory: boolean;
}

interface QuarantinedAttachmentPath {
  sourcePath: string;
  isolatedPath: string;
}

interface AttachmentQuarantineOperation {
  activeDirectory: string;
  entries: QuarantinedAttachmentPath[];
}

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

export type WorkflowStatus = 'COLLECTING' | 'GENERATING' | 'REVIEWING' | 'FINALIZED' | 'SUBMITTED';

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
  private readonly logger = new Logger(StudentService.name);

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
      return this.tryComputeRankForYear(TEMPORARY_RANK_FALLBACK_YEAR, mapped, totalScore, examYear);
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
    const difference = normalizedCurrent != null && calculatedRank != null ? normalizedCurrent - calculatedRank : null;

    return {
      calculatedRank,
      currentRank: normalizedCurrent,
      isMismatch: difference != null && difference !== 0,
      difference,
      requestedYear,
      sourceYear,
      isEstimated:
        source === 'score-segment' && requestedYear != null && sourceYear != null && requestedYear !== sourceYear,
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

    const rankComputation = await this.tryComputeRank(profile.examType, profile.examYear, profile.totalScore);

    return this.makeRankCheck(
      currentRank,
      rankComputation?.rank ?? null,
      rankComputation == null ? 'unavailable' : 'score-segment',
      profile.examYear,
      rankComputation?.sourceYear ?? null,
    );
  }

  private getUploadsRoot(): string {
    return process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads');
  }

  private isPathInside(parentPath: string, candidatePath: string, allowEqual = false): boolean {
    const relativePath = path.relative(parentPath, candidatePath);
    if (relativePath === '') return allowEqual;
    return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
  }

  private resolveUploadsStoragePath(uploadsRoot: string, storagePath: string): string | null {
    if (typeof storagePath !== 'string' || storagePath.trim() === '') return null;

    const segments = storagePath.split(/[\\/]+/);
    if (segments.length === 0 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      return null;
    }

    const candidatePath = path.resolve(uploadsRoot, ...segments);
    return this.isPathInside(uploadsRoot, candidatePath) ? candidatePath : null;
  }

  private resolveManagedAttachmentPath(uploadsRoot: string, studentId: number, storagePath: string): string | null {
    const candidatePath = this.resolveUploadsStoragePath(uploadsRoot, storagePath);
    if (!candidatePath) return null;

    const studentDirectory = path.resolve(uploadsRoot, 'students', String(studentId));
    return this.isPathInside(studentDirectory, candidatePath) ? candidatePath : null;
  }

  private resolveStudentOwnedReferencedPath(
    uploadsRoot: string,
    studentId: number,
    storagePath: string,
  ): string | null {
    const candidatePath = this.resolveUploadsStoragePath(uploadsRoot, storagePath);
    if (!candidatePath) return null;

    const ownedDirectories = [
      path.resolve(uploadsRoot, 'students', String(studentId)),
      path.resolve(uploadsRoot, 'historical', String(studentId)),
    ];
    return ownedDirectories.some((directory) => this.isPathInside(directory, candidatePath)) ? candidatePath : null;
  }

  private getAttachmentQuarantineDirectories(uploadsRoot: string) {
    const root = path.resolve(uploadsRoot, '.student-attachment-quarantine');
    return {
      root,
      active: path.join(root, 'active'),
      pending: path.join(root, 'pending'),
    };
  }

  private async retryPendingAttachmentCleanup(uploadsRoot: string): Promise<void> {
    const quarantine = this.getAttachmentQuarantineDirectories(uploadsRoot);

    const cleanupChildren = async (directory: string, requireMarker: boolean) => {
      let children: fs.Dirent[];
      try {
        children = await fs.promises.readdir(directory, {
          withFileTypes: true,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        this.logger.error(`无法扫描附件待清理目录: ${directory}`, error instanceof Error ? error.stack : undefined);
        return;
      }

      for (const child of children) {
        if (!child.isDirectory()) continue;
        const cleanupPath = path.resolve(directory, child.name);
        if (!this.isPathInside(directory, cleanupPath)) continue;

        if (requireMarker) {
          try {
            await fs.promises.access(path.join(cleanupPath, '.cleanup-ready'));
          } catch {
            continue;
          }
        }

        try {
          await fs.promises.rm(cleanupPath, { recursive: true, force: true });
        } catch (error) {
          this.logger.error(
            `附件隔离文件自动清理失败，将在后续操作重试: ${cleanupPath}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    };

    await cleanupChildren(quarantine.pending, false);
    await cleanupChildren(quarantine.active, true);
  }

  private async quarantineAttachmentPaths(
    uploadsRoot: string,
    sources: AttachmentQuarantineSource[],
  ): Promise<AttachmentQuarantineOperation> {
    const quarantine = this.getAttachmentQuarantineDirectories(uploadsRoot);
    await fs.promises.mkdir(quarantine.active, { recursive: true });

    const activeDirectory = path.join(quarantine.active, randomUUID());
    await fs.promises.mkdir(activeDirectory);
    const entries: QuarantinedAttachmentPath[] = [];

    try {
      for (const source of sources) {
        const sourcePath = path.resolve(source.sourcePath);
        if (
          !this.isPathInside(uploadsRoot, sourcePath) ||
          this.isPathInside(quarantine.root, sourcePath, true) ||
          entries.some((entry) => entry.sourcePath === sourcePath || this.isPathInside(entry.sourcePath, sourcePath))
        ) {
          continue;
        }

        let sourceStats: fs.Stats;
        try {
          sourceStats = await fs.promises.lstat(sourcePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }

        if (sourceStats.isDirectory() && !source.allowDirectory) {
          throw new BadRequestException('附件存储路径不能指向目录');
        }

        if (!sourceStats.isSymbolicLink()) {
          const [realUploadsRoot, realSourcePath] = await Promise.all([
            fs.promises.realpath(uploadsRoot),
            fs.promises.realpath(sourcePath),
          ]);
          if (!this.isPathInside(realUploadsRoot, realSourcePath)) {
            throw new BadRequestException('附件存储路径超出上传目录');
          }
        }

        const isolatedPath = path.join(activeDirectory, String(entries.length));
        await fs.promises.rename(sourcePath, isolatedPath);
        entries.push({ sourcePath, isolatedPath });
      }
    } catch (error) {
      await this.restoreAttachmentQuarantine({ activeDirectory, entries });
      throw error;
    }

    if (entries.length === 0) {
      await fs.promises.rm(activeDirectory, { recursive: true, force: true });
    }
    return { activeDirectory, entries };
  }

  private async restoreAttachmentQuarantine(operation: AttachmentQuarantineOperation): Promise<void> {
    let restoreError: unknown = null;

    for (const entry of [...operation.entries].reverse()) {
      try {
        await fs.promises.mkdir(path.dirname(entry.sourcePath), {
          recursive: true,
        });
        await fs.promises.rename(entry.isolatedPath, entry.sourcePath);
      } catch (error) {
        restoreError ??= error;
        this.logger.error(`附件隔离回滚失败: ${entry.sourcePath}`, error instanceof Error ? error.stack : undefined);
      }
    }

    if (restoreError) {
      this.logger.error(
        `附件未能完整恢复，保留隔离目录供人工恢复: ${operation.activeDirectory}`,
        restoreError instanceof Error ? restoreError.stack : undefined,
      );
      throw new Error('数据库操作失败，且附件文件未能完整恢复');
    }

    try {
      await fs.promises.rm(operation.activeDirectory, {
        recursive: true,
        force: true,
      });
    } catch (error) {
      this.logger.error(
        `附件隔离临时目录清理失败: ${operation.activeDirectory}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async finalizeAttachmentQuarantine(
    uploadsRoot: string,
    operation: AttachmentQuarantineOperation,
  ): Promise<boolean> {
    if (operation.entries.length === 0) return true;

    const quarantine = this.getAttachmentQuarantineDirectories(uploadsRoot);
    await fs.promises.mkdir(quarantine.pending, { recursive: true });
    const pendingDirectory = path.join(quarantine.pending, path.basename(operation.activeDirectory));
    let cleanupPath = pendingDirectory;

    try {
      await fs.promises.rename(operation.activeDirectory, pendingDirectory);
    } catch (error) {
      cleanupPath = operation.activeDirectory;
      try {
        await fs.promises.writeFile(path.join(cleanupPath, '.cleanup-ready'), '');
      } catch (markerError) {
        this.logger.error(
          `附件隔离目录无法标记为待清理，保留目录供人工清理: ${cleanupPath}`,
          markerError instanceof Error ? markerError.stack : undefined,
        );
        return false;
      }
      this.logger.error(
        `附件隔离目录状态切换失败: ${operation.activeDirectory}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    try {
      await fs.promises.rm(cleanupPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      this.logger.error(
        `附件物理文件清理失败，将在后续操作重试: ${cleanupPath}`,
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  private normalizeStudentAttachmentCategory(category: string): StudentAttachmentCategory {
    if (!STUDENT_ATTACHMENT_CATEGORY_SET.has(category)) {
      throw new BadRequestException('附件分类不正确');
    }
    return category as StudentAttachmentCategory;
  }

  private normalizeAttachmentOriginalName(name: string | null | undefined, fallback = 'attachment') {
    const value = (name || fallback).trim() || fallback;
    if (!/[\u0080-\u00ff]/.test(value)) {
      return value;
    }

    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    return /[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('\uFFFD') ? decoded : value;
  }

  private normalizeOptionalString(value: unknown, label = '字段', maxLength?: number): string | null {
    if (value == null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label}格式不正确`);
    }
    const text = value.trim();
    if (maxLength != null && text.length > maxLength) {
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
    }
    return text.length > 0 ? text : null;
  }

  private normalizeOptionalInt(value: unknown, label: string, range: { min: number; max: number }): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException(`${label}格式不正确`);
    }
    if (parsed < range.min || parsed > range.max) {
      throw new BadRequestException(`${label}超出有效范围`);
    }
    return parsed;
  }

  private detectAttachmentMimeType(buffer: Buffer): string | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'))) {
      return 'application/pdf';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (buffer.length >= 6) {
      const signature = buffer.subarray(0, 6).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }
    return null;
  }

  private validateAttachmentFile(file: Express.Multer.File): ValidatedAttachmentFormat {
    if (!file?.buffer || file.buffer.length <= 0) {
      throw new BadRequestException('请上传文件');
    }
    if (file.buffer.length > MAX_STUDENT_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException('单个附件不能超过 20MB');
    }

    const detectedMimeType = this.detectAttachmentMimeType(file.buffer);
    if (!detectedMimeType) {
      throw new BadRequestException('仅支持 PDF、JPG、PNG、WEBP、GIF 格式');
    }

    const originalExtension = path.extname(file.originalname || '').toLowerCase();
    if (originalExtension && !ALLOWED_ATTACHMENT_EXTENSIONS.has(originalExtension)) {
      throw new BadRequestException('仅支持 PDF、JPG、PNG、WEBP、GIF 格式');
    }
    if (originalExtension && EXTENSION_MIME_TYPE[originalExtension] !== detectedMimeType) {
      throw new BadRequestException('文件扩展名与实际内容不一致');
    }

    const declaredMimeType = String(file.mimetype || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    const normalizedDeclaredMimeType = MIME_TYPE_ALIASES[declaredMimeType];
    if (!GENERIC_ATTACHMENT_MIME_TYPES.has(declaredMimeType) && !normalizedDeclaredMimeType) {
      throw new BadRequestException('仅支持 PDF、JPG、PNG、WEBP、GIF 格式');
    }
    if (normalizedDeclaredMimeType && normalizedDeclaredMimeType !== detectedMimeType) {
      throw new BadRequestException('文件 MIME 类型与实际内容不一致');
    }

    return {
      mimeType: detectedMimeType,
      extension: originalExtension || MIME_TYPE_CANONICAL_EXTENSION[detectedMimeType],
    };
  }

  private async assertStudentAccess(studentId: number, requester: JwtPayloadUser, action: 'read' | 'update') {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, teacherId: true, userId: true },
    });
    if (!profile) throw new NotFoundException('学生不存在');

    const isAdmin = requester.role === 'ADMIN';
    const isOwnerTeacher =
      requester.role === 'TEACHER' &&
      requester.teacherProfileId != null &&
      profile.teacherId === requester.teacherProfileId;
    const isStudentSelf = action === 'read' && requester.role === 'STUDENT' && requester.studentProfileId === studentId;

    if (!isAdmin && !isOwnerTeacher && !isStudentSelf) {
      throw new ForbiddenException(action === 'read' ? '无权查看该学生资料' : '无权修改不属于自己的学生资料');
    }

    return profile;
  }

  async listAttachments(studentId: number, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'read');
    const attachments = await this.prisma.studentAttachment.findMany({
      where: { studentId },
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        studentId: true,
        category: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
        updatedAt: true,
        uploadedById: true,
      },
    });
    return attachments.map((attachment) => ({
      ...attachment,
      originalName: this.normalizeAttachmentOriginalName(attachment.originalName),
    }));
  }

  async uploadAttachment(studentId: number, category: string, file: Express.Multer.File, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'update');
    const normalizedCategory = this.normalizeStudentAttachmentCategory(category);
    const validatedFormat = this.validateAttachmentFile(file);

    const uploadsRoot = this.getUploadsRoot();
    const relativeDir = path.join('students', String(studentId));
    const targetDir = path.join(uploadsRoot, relativeDir);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const ext = originalExt || validatedFormat.extension;
    const storedName = `${normalizedCategory}_${Date.now()}_${randomUUID()}${ext}`;
    const normalizedOriginalName = this.normalizeAttachmentOriginalName(file.originalname, storedName);
    const originalDisplayExtension = path.extname(normalizedOriginalName);
    const displayExtension = originalDisplayExtension || ext;
    const displayBaseName = originalDisplayExtension
      ? normalizedOriginalName.slice(0, -originalDisplayExtension.length)
      : normalizedOriginalName;
    const originalName = `${displayBaseName.slice(0, 255 - displayExtension.length)}${displayExtension}`;
    const targetPath = path.join(targetDir, storedName);
    const storagePath = path.join(relativeDir, storedName).replace(/\\/g, '/');

    try {
      await fs.promises.writeFile(targetPath, file.buffer);
      const created = await this.prisma.studentAttachment.create({
        data: {
          studentId,
          category: normalizedCategory,
          originalName,
          storagePath,
          mimeType: validatedFormat.mimeType,
          fileSize: file.buffer.length,
          uploadedById: requester.id,
        },
        select: {
          id: true,
          studentId: true,
          category: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          createdAt: true,
          updatedAt: true,
          uploadedById: true,
        },
      });

      return {
        ...created,
        originalName: this.normalizeAttachmentOriginalName(created.originalName),
      };
    } catch (error) {
      try {
        await fs.promises.rm(targetPath, { force: true });
      } catch (cleanupError) {
        this.logger.error(
          `上传附件失败后无法清理文件: ${targetPath}`,
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }
      throw error;
    }
  }

  async getAttachmentForStudentAccess(studentId: number, attachmentId: number, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'read');
    const attachment = await this.prisma.studentAttachment.findFirst({
      where: { id: attachmentId, studentId },
    });
    if (!attachment) throw new NotFoundException('附件不存在');
    return {
      ...attachment,
      originalName: this.normalizeAttachmentOriginalName(attachment.originalName),
    };
  }

  async deleteAttachment(studentId: number, attachmentId: number, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'update');
    const uploadsRoot = path.resolve(this.getUploadsRoot());
    await this.retryPendingAttachmentCleanup(uploadsRoot);

    const attachment = await this.prisma.studentAttachment.findFirst({
      where: { id: attachmentId, studentId },
    });
    if (!attachment) throw new NotFoundException('附件不存在');

    const filePath = this.resolveManagedAttachmentPath(uploadsRoot, studentId, attachment.storagePath);
    if (!filePath) {
      throw new BadRequestException('该附件不是学生管理页上传的归档附件');
    }

    const quarantine = await this.quarantineAttachmentPaths(uploadsRoot, [
      { sourcePath: filePath, allowDirectory: false },
    ]);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (attachment.category === 'admission_proof') {
          await tx.studentAdmissionResult.updateMany({
            where: { studentId, proofAttachmentId: attachmentId },
            data: { proofAttachmentId: null },
          });
        }
        await tx.studentAttachment.delete({ where: { id: attachmentId } });
      });
    } catch (error) {
      await this.restoreAttachmentQuarantine(quarantine);
      throw error;
    }

    const fileDeleted = await this.finalizeAttachmentQuarantine(uploadsRoot, quarantine);
    if (!fileDeleted) {
      return {
        deleted: true,
        fileDeleted: false,
        cleanupPending: true,
      };
    }

    return { deleted: true };
  }

  async getAdmissionResult(studentId: number, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'read');
    return this.prisma.studentAdmissionResult.findUnique({
      where: { studentId },
    });
  }

  async saveAdmissionResult(studentId: number, dto: SaveAdmissionResultDto, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'update');

    const admittedUniName = this.normalizeOptionalString(dto.admittedUniName, '录取院校', 200);
    if (!admittedUniName) {
      throw new BadRequestException('请填写录取院校');
    }

    const proofAttachmentId = this.normalizeOptionalInt(dto.proofAttachmentId, '录取截图', {
      min: 1,
      max: 2_147_483_647,
    });
    const admittedMinScore = this.normalizeOptionalInt(dto.admittedMinScore, '录取最低分', { min: 0, max: 750 });

    return this.prisma.$transaction(
      async (tx) => {
        // SERIALIZABLE 让“校验凭证存在”和“写入凭证 ID”成为一个原子操作。
        // 与删除附件事务并发时，删除或保存至多一个成功，不会写回已删除附件 ID。
        if (proofAttachmentId != null) {
          const proof = await tx.studentAttachment.findFirst({
            where: {
              id: proofAttachmentId,
              studentId,
              category: 'admission_proof',
            },
            select: { id: true },
          });
          if (!proof) {
            throw new BadRequestException('请选择该学生名下的录取截图作为凭证');
          }
        }

        const student = await tx.studentProfile.findUnique({
          where: { id: studentId },
          select: { totalScore: true },
        });
        if (!student) throw new NotFoundException('学生不存在');

        const scoreDiff =
          student.totalScore != null && admittedMinScore != null ? student.totalScore - admittedMinScore : null;
        const data = {
          admittedUniName,
          admittedUniId: this.normalizeOptionalInt(dto.admittedUniId, '录取院校ID', {
            min: 1,
            max: 2_147_483_647,
          }),
          admittedMinScore,
          admittedMinRank: this.normalizeOptionalInt(dto.admittedMinRank, '录取最低位次', {
            min: 1,
            max: 100_000_000,
          }),
          scoreDiff,
          sequenceNo: this.normalizeOptionalInt(dto.sequenceNo, '录取志愿顺序', {
            min: 1,
            max: 1_000,
          }),
          proofAttachmentId,
          batchName: this.normalizeOptionalString(dto.batchName, '录取批次', 100),
          admittedMajorGroupCode: this.normalizeOptionalString(dto.admittedMajorGroupCode, '录取院校专业组代码', 10),
          admittedMajorCode: this.normalizeOptionalString(dto.admittedMajorCode, '录取专业代码', 10),
          admittedMajorName: this.normalizeOptionalString(dto.admittedMajorName, '录取专业名称', 200),
          admittedMajorId: this.normalizeOptionalInt(dto.admittedMajorId, '录取专业ID', {
            min: 1,
            max: 2_147_483_647,
          }),
        };

        return tx.studentAdmissionResult.upsert({
          where: { studentId },
          create: { studentId, ...data },
          update: data,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async archiveStudent(studentId: number, requester: JwtPayloadUser) {
    await this.assertStudentAccess(studentId, requester, 'update');

    return this.prisma.$transaction(async (tx) => {
      const admissionResult = await tx.studentAdmissionResult.findUnique({
        where: { studentId },
        select: {
          admittedUniName: true,
          proofAttachmentId: true,
        },
      });
      if (!admissionResult?.admittedUniName?.trim()) {
        throw new BadRequestException('请先填写录取院校和录取结果');
      }

      const publishedPlan = await tx.volunteerPlan.findFirst({
        where: { studentId, status: 'PUBLISHED' },
        orderBy: { versionNo: 'desc' },
        select: { id: true },
      });
      if (!publishedPlan) {
        throw new BadRequestException('请先确认终稿已提交考试院');
      }

      let admissionProof =
        admissionResult.proofAttachmentId == null
          ? null
          : await tx.studentAttachment.findFirst({
              where: {
                id: admissionResult.proofAttachmentId,
                studentId,
                category: 'admission_proof',
              },
              select: { id: true },
            });
      if (!admissionProof) {
        admissionProof = await tx.studentAttachment.findFirst({
          where: { studentId, category: 'admission_proof' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
      }
      if (!admissionProof) {
        throw new BadRequestException('请先上传录取截图');
      }

      if (admissionResult.proofAttachmentId !== admissionProof.id) {
        await tx.studentAdmissionResult.update({
          where: { studentId },
          data: { proofAttachmentId: admissionProof.id },
        });
      }

      await tx.volunteerPlan.update({
        where: { id: publishedPlan.id },
        data: { isHistorical: true },
      });

      return tx.studentProfile.update({
        where: { id: studentId },
        data: { isArchived: true },
        include: { admissionResult: true },
      });
    });
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

    try {
      return await this.prisma.user.create({
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
        // select 白名单: 不回 passwordHash (默认 include 会把 bcrypt hash 带进响应);
        // 前端跳详情页要 studentProfile.id
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          gender: true,
          role: true,
          createdAt: true,
          studentProfile: { select: { id: true, teacherId: true } },
        },
      });
    } catch (e) {
      // 手机号撞 User.phone 唯一索引 → P2002, 转友好 400 而非 500
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const hint = `${(e.meta as any)?.target ?? ''} ${e.message}`.toLowerCase();
        if (hint.includes('phone')) throw new BadRequestException('该手机号已被其他账号使用');
        if (hint.includes('email')) throw new BadRequestException('该邮箱已被其他账号使用');
        throw new BadRequestException('账号信息与已有记录冲突');
      }
      throw e;
    }
  }

  /**
   * Paginated query for students belonging to a teacher.
   * Admin callers pass teacherProfileId = undefined to see all.
   */
  async findByTeacher(teacherProfileId: number | undefined, query: QueryStudentDto) {
    const {
      status,
      keyword,
      page = 1,
      pageSize = 20,
      assignmentStatus,
      teacherProfileId: assignedTeacherProfileId,
    } = query;

    // 默认过滤归档学生 (历史届): 它们走 historical-cases 模块, 不在活跃学生列表
    const where: Prisma.StudentProfileWhereInput = { isArchived: false };

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
        OR: [{ realName: { contains: keyword } }, { username: { contains: keyword } }],
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
              birthDate: true,
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
            // 取最新版本(versionNo)而非最近改动: 派生二稿时初稿被置 OUTDATED 会刷新 @updatedAt,
            // 用 updatedAt 排序会把过期初稿当成最新方案, versionNo 才稳。
            where: { isHistorical: false, status: { not: 'OUTDATED' } },
            orderBy: { versionNo: 'desc' },
            take: 8,
            select: {
              id: true,
              status: true,
              updatedAt: true,
              versionNo: true,
              batchName: true,
            },
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
      const latestPlan =
        p.volunteerPlans?.find((plan) => plan.status === 'PENDING_REVIEW' || plan.status === 'REVIEWING') ??
        p.volunteerPlans?.[0];
      return {
        ...p,
        progress: this.progressService.compute({
          ...p,
          realName: (p as any).user?.realName,
          phone: (p as any).user?.phone,
          gender: (p as any).user?.gender,
          ethnicity: (p as any).user?.ethnicity,
          birthDate: (p as any).user?.birthDate,
        }),
        workflowStatus: deriveWorkflowStatus(p.intakeStatus, latestPlan?.status),
        planCount: p._count?.volunteerPlans ?? p.volunteerPlans?.length ?? 0,
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
            birthDate: true,
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
          // 同上: 取最新版本(versionNo)而非最近改动, 避免被置 OUTDATED 的初稿盖过新版。
          orderBy: { versionNo: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            updatedAt: true,
            versionNo: true,
            batchName: true,
          },
        },
        admissionResult: true,
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
      birthDate: profile.user?.birthDate,
    });

    const rankCheck = await this.computeRankCheck(profile);

    const eligibleLevel = await this.computeEligibleLevel(profile);

    const latestPlan = profile.volunteerPlans?.[0];

    return {
      ...profile,
      progress,
      rankCheck,
      eligibleLevel,
      workflowStatus: deriveWorkflowStatus(profile.intakeStatus, latestPlan?.status),
      planCount: profile._count?.volunteerPlans ?? profile.volunteerPlans?.length ?? 0,
      latestPlanStatus: latestPlan?.status ?? null,
      latestPlanId: latestPlan?.id ?? null,
      latestPlanVersionNo: latestPlan?.versionNo ?? null,
    };
  }

  /** 查该生本科批控制线并判定 eligibleLevel。仅支持物理/历史；其余科类/缺分→null。 */
  private async computeEligibleLevel(profile: {
    totalScore: number | null;
    examType: string | null;
    examYear: number | null;
    province: string | null;
    examLocationProvince?: string | null;
  }): Promise<'本科' | '专科' | null> {
    if (profile.totalScore == null) return null;
    const examTypeAliases =
      profile.examType === 'PHYSICS' ? ['物理', '物理类'] : profile.examType === 'HISTORY' ? ['历史', '历史类'] : null;
    if (!examTypeAliases) return null;
    // 本科线按"高考报名省"查(随迁子女户籍≠报名省, 用户籍会查不到线→eligibleLevel 误判 null)
    const province = profile.examLocationProvince ?? profile.province ?? '四川';
    const examYear = profile.examYear ?? 2026;
    const batchAliases = ['本科批次', '本科批', '本科'];
    const findLine = async (year: number) => {
      const row = await this.prisma.batchLine.findFirst({
        where: {
          year,
          province,
          batch: { in: batchAliases },
          examType: { in: examTypeAliases },
        },
        select: { score: true },
      });
      return row?.score ?? null;
    };
    const line = (await findLine(examYear)) ?? (await findLine(examYear - 1));
    return eligibleLevelFromScore(profile.totalScore, line);
  }

  /**
   * Compute provenance updates to merge into a PATCH payload.
   * Maps incoming fields to {hukou,bonus,examLocation}UpdatedBy/At pairs.
   */
  private computeProvenanceUpdates(dto: Record<string, any>, actor: 'student' | 'teacher'): Record<string, any> {
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
  async updateProfile(
    id: number,
    dto: UpdateStudentProfileDto,
    actor: 'student' | 'teacher' = 'teacher',
    changedById?: number,
    // 归属校验: 非 ADMIN 老师传入自己的 teacherProfileId, 只能改自己名下学生。
    // 与 reviewIntake 同口径; undefined = 不校验 (ADMIN)。补这道闸前任意老师 token 可越权写。
    ownerTeacherProfileId?: number,
  ) {
    const { dataVersion, ...rawUpdateData } = dto as Record<string, any>;
    const { profileUpdates: updateData, userUpdates } = this.splitUserLevelUpdates(rawUpdateData);

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
            birthDate: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException('学生不存在');
    }
    if (ownerTeacherProfileId != null && current.teacherId !== ownerTeacherProfileId) {
      throw new ForbiddenException('无权修改不属于自己的学生资料');
    }

    // ── 计算变更日志(只追踪白名单字段)──
    const changeLogEntries: Array<{
      fieldKey: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    if (changedById !== undefined) {
      const oldSnapshot = current as Record<string, unknown>;
      const incoming = { ...updateData, ...userUpdates } as Record<string, unknown>;
      for (const fieldKey of Object.keys(incoming)) {
        if (!TRACKED_FIELD_KEYS.has(fieldKey)) continue;
        const oldVal = oldSnapshot[fieldKey];
        const newVal = incoming[fieldKey];
        if (!valuesEqual(oldVal, newVal)) {
          changeLogEntries.push({
            fieldKey,
            oldValue: serializeFieldValue(oldVal),
            newValue: serializeFieldValue(newVal),
          });
        }
      }
    }

    // dataVersion 缺失（auto-save 单字段保存）时跳过乐观锁；显式传入时严格校验
    if (dataVersion !== undefined && current.dataVersion !== dataVersion) {
      throw new ConflictException('数据已被其他人修改，请刷新后重试');
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
      updateData.totalScore !== undefined || updateData.examType !== undefined || updateData.examYear !== undefined;
    const rankSubmitted = updateData.provincialRank !== undefined;
    if (scoreOrTypeChanged && !rankSubmitted) {
      const computed = await this.tryComputeRank(merged.examType, merged.examYear, merged.totalScore);
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

    const runUpdate = async () =>
      this.prisma.$transaction(async (tx) => {
        const result = await tx.studentProfile.update({
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
                birthDate: true,
              },
            },
          },
        });

        if (changeLogEntries.length > 0 && changedById !== undefined) {
          await tx.studentFieldChangeLog.createMany({
            data: changeLogEntries.map((e) => ({
              studentId: id,
              changedById,
              actor,
              fieldKey: e.fieldKey,
              oldValue: e.oldValue,
              newValue: e.newValue,
            })),
          });
        }

        return result;
      });

    // 唯一约束冲突（手机号/邮箱/用户名重复）转成友好 400，避免冒成 500 Internal server error
    let updated;
    try {
      updated = await runUpdate();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const hint = `${(e.meta as any)?.target ?? ''} ${e.message}`.toLowerCase();
        if (hint.includes('phone')) {
          throw new BadRequestException('该手机号已被其他账号使用');
        }
        if (hint.includes('email')) {
          throw new BadRequestException('该邮箱已被其他账号使用');
        }
        if (hint.includes('username')) {
          throw new BadRequestException('该用户名已被占用');
        }
        throw new BadRequestException('保存失败：存在重复的唯一字段');
      }
      throw e;
    }

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
   * 彻底删除学生（含登录账号），不可逆。
   *
   * 外键现状：指向 StudentProfile 的关系里只有 VolunteerPlan 未级联，
   * 指向 User 的子表（收藏/搜索/对比/订单/通知/审计/旧方案）也都未级联。
   * 所以必须在一个事务里按依赖顺序手动清干净，否则外键约束会让删除失败。
   */
  async deleteStudentPermanently(studentId: number, requester: JwtPayloadUser) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, userId: true, teacherId: true },
    });
    if (!profile) {
      throw new NotFoundException('学生不存在');
    }

    // 权限：管理员可删任意；老师只能删自己带的（主管可删团队内）
    const isAdmin = requester.role === Role.ADMIN;
    const isOwnerTeacher =
      requester.role === Role.TEACHER &&
      (requester.isSupervisor === true || profile.teacherId === requester.teacherProfileId);
    if (!isAdmin && !isOwnerTeacher) {
      throw new ForbiddenException('无权删除该学生');
    }

    const { userId } = profile;
    const uploadsRoot = path.resolve(this.getUploadsRoot());
    await this.retryPendingAttachmentCleanup(uploadsRoot);

    const referencedAttachments = await this.prisma.studentAttachment.findMany({
      where: { studentId },
      select: { storagePath: true },
    });
    const quarantineSources: AttachmentQuarantineSource[] = [
      {
        sourcePath: path.resolve(uploadsRoot, 'students', String(studentId)),
        allowDirectory: true,
      },
    ];
    for (const attachment of referencedAttachments) {
      const referencedPath = this.resolveStudentOwnedReferencedPath(uploadsRoot, studentId, attachment.storagePath);
      if (!referencedPath) {
        this.logger.warn(
          `跳过不属于学生安全目录的附件路径，防止误删: student=${studentId}, path=${attachment.storagePath}`,
        );
        continue;
      }
      quarantineSources.push({
        sourcePath: referencedPath,
        allowDirectory: false,
      });
    }

    const quarantine = await this.quarantineAttachmentPaths(uploadsRoot, quarantineSources);

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. 先删方案（VolunteerPlan→StudentProfile 未级联），其子表随 plan 级联
        await tx.volunteerPlan.deleteMany({ where: { studentId } });
        await tx.volunteerPlan.deleteMany({ where: { userId } }); // 旧 legacyUser 方案

        // 2. 清该用户名下的子表（均未级联）
        await tx.searchHistory.deleteMany({ where: { userId } });
        await tx.favorite.deleteMany({ where: { userId } });
        await tx.comparison.deleteMany({ where: { userId } });
        await tx.order.deleteMany({ where: { userId } });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.auditLog.deleteMany({ where: { userId } });

        // 3. 删档案（录取记录/附件等随档案级联），再删登录账号
        await tx.studentProfile.delete({ where: { id: studentId } });
        await tx.user.delete({ where: { id: userId } });
      });
    } catch (error) {
      await this.restoreAttachmentQuarantine(quarantine);
      throw error;
    }

    const filesDeleted = await this.finalizeAttachmentQuarantine(uploadsRoot, quarantine);
    return filesDeleted ? { message: '学生已彻底删除' } : { message: '学生已彻底删除', cleanupPending: true };
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
            birthDate: true,
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
      birthDate: profile.user.birthDate,
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
            birthDate: true,
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
      birthDate: profile.user.birthDate,
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

  /**
   * 老师解锁学生已锁定的批次选择。
   * 商业化流程: 学生提交资料 → 锁定批次 → 如需调整批次必须老师解锁
   * 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 三
   */
  async unlockBatches(
    studentId: number,
    teacherUserId: number,
    teacherProfileId?: number,
  ): Promise<{ unlocked: boolean; reason?: string }> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, teacherId: true, batchesConfirmedAt: true },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if (teacherProfileId !== undefined && student.teacherId !== teacherProfileId) {
      throw new ForbiddenException('无权解锁该学生的批次');
    }
    if (!student.batchesConfirmedAt) {
      return { unlocked: false, reason: '批次未锁定, 无需解锁' };
    }
    await this.prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        batchesConfirmedAt: null,
        batchesUnlockedBy: teacherUserId,
        batchesUnlockedAt: new Date(),
        intakeStatus: 'NEEDS_CHANGES',
      },
    });
    return { unlocked: true };
  }

  /**
   * 老师在批次推荐页确认最终批次, 同时把 intakeStatus 切到 VERIFIED。
   * 见 docs/superpowers/specs/2026-06-03-batch-recommendation-page-design.md § 六.2
   */
  async confirmBatches(
    studentId: number,
    opts: {
      teacherProfileId?: number;
      reviewerUserId: number;
      preferredBatches: string[];
      reviewComment?: string;
    },
  ) {
    if (!Array.isArray(opts.preferredBatches) || opts.preferredBatches.length === 0) {
      throw new BadRequestException('至少选定 1 个批次');
    }
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      include: {
        user: { select: { birthDate: true, ethnicity: true, gender: true } },
      },
    });
    if (!student) throw new NotFoundException('学生不存在');
    if (opts.teacherProfileId !== undefined && student.teacherId !== opts.teacherProfileId) {
      throw new ForbiddenException('无权确认不属于自己的学生的批次');
    }
    // 允许 SUBMITTED / NEEDS_CHANGES / VERIFIED 三种状态调整批次:
    //   - SUBMITTED / NEEDS_CHANGES: 初次 confirm, 写入 preferredBatches + 升 VERIFIED
    //   - VERIFIED: 老师事后想调整批次 (例如学生详情页先点过"确认资料"再回头选批次,
    //     或方案制作中发现批次不合适需要换), 也允许 overwrite preferredBatches.
    //   - DRAFT: 学生还没自填提交, 不允许
    if (student.intakeStatus === 'DRAFT') {
      throw new ConflictException('学生尚未提交资料, 无法选定批次');
    }
    // 批次名校验: 必须都在该生可见的 batchConfig 批次集合内 (与 batch-recommendations 页同口径).
    // 真值源是 batch_configs 表 — 旧实现用硬编码白名单(仅 6 批次), 把强基/专项/艺体等真实批次误判为"未知".
    const examTypeLabel =
      (
        {
          PHYSICS: '物理',
          HISTORY: '历史',
          COMPREHENSIVE_LIBERAL: '文科',
          COMPREHENSIVE_SCIENCE: '理科',
        } as Record<string, string>
      )[String(student.examType ?? 'PHYSICS')] || '物理';
    const validBatchRows = await this.prisma.batchConfig.findMany({
      where: {
        year: student.examYear ?? 2026,
        // 批次结构按"高考报名省"查(随迁子女户籍≠报名省, 用户籍会查不到→批次全判"未知")
        province: student.examLocationProvince ?? student.province ?? '四川',
        examType: examTypeLabel,
      },
      select: { batch: true },
    });
    const validBatchSet = new Set(validBatchRows.map((r) => r.batch));
    for (const b of opts.preferredBatches) {
      if (!validBatchSet.has(b)) {
        throw new BadRequestException(`未知批次: ${b}`);
      }
    }
    // 关键资料必填门已取消 (2026-06-25): 缺字段也允许确认批次, 不硬拦。
    // 批次资格判定 (judgeBatchEligibility) 对缺失字段按"未填"降级处理, 不阻断流程。
    return this.prisma.studentProfile.update({
      where: { id: studentId },
      data: {
        preferredBatches: opts.preferredBatches as any,
        batchesConfirmedAt: new Date(),
        intakeStatus: 'VERIFIED',
        intakeReviewedBy: opts.reviewerUserId,
        intakeReviewedAt: new Date(),
        intakeReviewComment: opts.reviewComment ?? null,
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

  async getChangeLogs(studentId: number, query: { limit?: number; offset?: number; fieldKey?: string } = {}) {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;
    const where: { studentId: number; fieldKey?: string } = { studentId };
    if (query.fieldKey) where.fieldKey = query.fieldKey;

    const [logs, total] = await Promise.all([
      this.prisma.studentFieldChangeLog.findMany({
        where,
        include: {
          changedBy: {
            select: { id: true, realName: true, username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.studentFieldChangeLog.count({ where }),
    ]);

    return { logs, total, limit, offset };
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
    return this.updateProfile(profile.id, dto, 'student', userId);
  }
}
