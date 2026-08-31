import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { VolunteerFormParserService } from "../plan-import/volunteer-form-parser.service";
import type { ParsedForm } from "../plan-import/volunteer-form.types";
import { resolveBatchQueryShape } from "../plan-candidate/batch-alias";
import type { JwtPayloadUser } from "../casl/types";
import { StudentService } from "./student.service";
import { AnalyzeAdmissionResultDto } from "./dto/analyze-admission-result.dto";
import {
  AdmissionMatchStatus,
  matchAdmissionToVolunteerForm,
  type AdmissionCatalogMajor,
  type AdmissionGroupCandidate,
  type AdmissionMatchResult,
  type RecognizedAdmission,
} from "./admission-match";

type ExtendedMatchStatus =
  | AdmissionMatchStatus
  | "FORM_NOT_FOUND"
  | "PARSE_FAILED";

interface AdmissionRecognitionPayload {
  batchName?: unknown;
  examType?: unknown;
  levelName?: unknown;
  universityCode?: unknown;
  universityName?: unknown;
  groupCode?: unknown;
  majorCode?: unknown;
  majorName?: unknown;
  queryTime?: unknown;
  confidence?: unknown;
  fieldConfidences?: unknown;
  warnings?: unknown;
  source?: unknown;
  identityMatch?: unknown;
}

type IdentityCheck = "MATCHED" | "MISMATCH" | "UNAVAILABLE";

interface AnalysisBaseline {
  id: number;
  updatedAt: Date;
  proofAttachmentId: number | null;
  submissionAttachmentId: number | null;
  matchConfirmedAt: Date | null;
}

interface RecognitionReview {
  requiresReview: boolean;
  warnings: string[];
}

interface StudentAnalysisContext {
  realName: string;
  examYear: number | null;
  examType: string | null;
}

interface SafeAdmissionRecognition extends RecognizedAdmission {
  batchName: string;
  examType: string;
  levelName: string;
  universityCode: string;
  universityName: string;
  groupCode: string;
  majorCode: string;
  majorName: string;
  queryTime: string;
  confidence: number;
  fieldConfidences: Record<string, number>;
  warnings: string[];
  source: string;
  identityMatch: boolean | null;
}

interface SubmissionSource {
  id: number;
  originalName: string;
  mimeType: string | null;
  buffer: Buffer;
}

export interface ResponseCandidate {
  submissionAttachmentId: number;
  submissionAttachmentName: string;
  sequenceNo: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  batchName: string;
  reason: string;
}

@Injectable()
export class AdmissionMatchService {
  private readonly parserVersion = "admission-match-v1";

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly studentService: StudentService,
    private readonly volunteerFormParser: VolunteerFormParserService,
  ) {}

  async analyze(
    studentId: number,
    dto: AnalyzeAdmissionResultDto,
    requester: JwtPayloadUser,
  ) {
    const { analysisRevision, analysisBaseline } =
      await this.reserveAnalysisRevision(studentId, requester);
    const proof = await this.studentService.readAttachmentForAnalysis(
      studentId,
      dto.proofAttachmentId,
      "admission_proof",
      requester,
    );
    const studentContext = await this.getStudentAnalysisContext(studentId);
    const recognized = await this.recognizeAdmissionProof(
      proof.buffer,
      proof.originalName,
      proof.mimeType,
      studentContext.realName,
    );
    const proofIdentityCheck = this.toIdentityCheck(recognized.identityMatch);

    const university = await this.resolveUniversity(recognized);
    const recognitionReview = this.evaluateRecognitionReview(
      recognized,
      university,
      studentContext,
    );
    if (!recognized.universityName && university?.name) {
      recognized.universityName = university.name;
    }
    if (!recognized.universityCode && university?.code) {
      recognized.universityCode = university.code;
    }
    if (!recognized.universityName) {
      throw new UnprocessableEntityException(
        "录取截图中没有识别到院校名称，请换一张更清晰的截图后重试",
      );
    }
    const proofWarnings = this.identityWarnings("录取截图", proofIdentityCheck);

    const source = await this.resolveSubmissionSource(
      studentId,
      dto.submissionAttachmentId,
      requester,
    );
    if (!source) {
      return this.persistAndBuildResponse({
        studentId,
        proofAttachmentId: proof.id,
        source: null,
        recognized,
        university,
        matchStatus:
          proofIdentityCheck === "MATCHED" && !recognitionReview.requiresReview
            ? "FORM_NOT_FOUND"
            : AdmissionMatchStatus.REVIEW_REQUIRED,
        message: "已识别录取信息，但尚未找到志愿填报 PDF，未锁定志愿顺序",
        warnings: [
          ...recognized.warnings,
          ...recognitionReview.warnings,
          ...proofWarnings,
          "请上传该批次最终提交的志愿填报 PDF 后重新识别",
        ],
        proofIdentityCheck,
        analysisBaseline,
        analysisRevision,
        requester,
      });
    }
    const sourceWarnings = await this.getSubmissionSourceWarnings(
      studentId,
      dto.submissionAttachmentId != null,
    );

    let parsedForm: ParsedForm;
    let parseSource: "pdf-text" | "ocr";
    try {
      const parsed = await this.volunteerFormParser.parseAttachment(
        source.buffer,
        source.originalName,
        source.mimeType ?? "application/pdf",
      );
      parsedForm = parsed.form;
      parseSource = parsed.source;
      if (parsedForm.volunteers.length === 0) {
        throw new Error("未识别到志愿条目");
      }
    } catch {
      return this.persistAndBuildResponse({
        studentId,
        proofAttachmentId: proof.id,
        source,
        recognized,
        university,
        matchStatus:
          proofIdentityCheck === "MATCHED" && !recognitionReview.requiresReview
            ? "PARSE_FAILED"
            : AdmissionMatchStatus.REVIEW_REQUIRED,
        message: "录取信息已识别，但志愿填报 PDF 解析失败，未锁定志愿顺序",
        warnings: [
          ...recognized.warnings,
          ...recognitionReview.warnings,
          ...proofWarnings,
          ...sourceWarnings,
          "请确认上传的是该批次最终志愿表 PDF，或重新上传清晰文件",
        ],
        proofIdentityCheck,
        analysisBaseline,
        analysisRevision,
        requester,
      });
    }

    const catalog = await this.loadGroupCatalog(
      studentId,
      university?.id ?? null,
      recognized.groupCode,
      recognized.batchName,
    );
    const match = matchAdmissionToVolunteerForm(recognized, parsedForm, {
      groupCatalogMajors: catalog,
    });
    const formRecognitionWarnings = this.evaluateFormRecognitionConsistency(
      recognized,
      parsedForm,
      studentContext,
    );
    const recognitionRequiresReview =
      recognitionReview.requiresReview || formRecognitionWarnings.length > 0;
    const submissionIdentityCheck = this.checkSubmissionIdentity(
      parsedForm,
      studentContext.realName,
    );
    const identityCheck = this.combineIdentityChecks(
      proofIdentityCheck,
      submissionIdentityCheck,
    );
    // 任何需复核状态都不能自动锁定志愿序号。匹配到的组只作为候选证据返回。
    const safeMatch =
      match.status === AdmissionMatchStatus.REVIEW_REQUIRED ||
      identityCheck !== "MATCHED" ||
      recognitionRequiresReview
        ? {
            ...match,
            sequenceNo: null,
            majorSequenceNo: null,
            isAdjusted: null,
          }
        : match;
    if (identityCheck !== "MATCHED" || recognitionRequiresReview) {
      safeMatch.status = AdmissionMatchStatus.REVIEW_REQUIRED;
    }
    const warnings = this.uniqueWarnings([
      ...recognized.warnings,
      ...recognitionReview.warnings,
      ...formRecognitionWarnings,
      ...proofWarnings,
      ...sourceWarnings,
      ...safeMatch.warnings,
      ...this.identityWarnings("志愿填报 PDF", submissionIdentityCheck),
      ...(match.status === AdmissionMatchStatus.GROUP_NOT_FOUND
        ? [
            "未匹配到院校专业组，请核对录取批次、最终提交 PDF 版本、OCR 识别结果，并确认是否属于征集志愿或补录",
          ]
        : []),
    ]);
    const candidates = this.buildCandidates(source, parsedForm, safeMatch);
    const message = this.matchMessage(safeMatch.status, safeMatch);

    return this.persistAndBuildResponse({
      studentId,
      proofAttachmentId: proof.id,
      source,
      recognized,
      university,
      parsedForm,
      parseSource,
      catalog,
      match: safeMatch,
      matchStatus: safeMatch.status,
      message,
      warnings,
      candidates,
      identityCheck,
      proofIdentityCheck,
      submissionIdentityCheck,
      analysisBaseline,
      analysisRevision,
      requester,
    });
  }

  private async recognizeAdmissionProof(
    buffer: Buffer,
    filename: string,
    mimeType: string | null,
    expectedName: string,
  ): Promise<SafeAdmissionRecognition> {
    const ocrServiceUrl =
      this.config.get<string>("OCR_SERVICE_URL") || "http://127.0.0.1:8100";
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], {
        type: mimeType || "application/octet-stream",
      }),
      filename,
    );
    form.append("expected_name", expectedName);

    let response: Response;
    try {
      response = await fetch(`${ocrServiceUrl}/parse-admission-result`, {
        method: "POST",
        body: form as any,
        signal: AbortSignal.timeout(2 * 60_000),
      });
    } catch {
      throw new UnprocessableEntityException(
        "录取截图识别服务暂时不可用，附件已保留，可稍后点击重新识别",
      );
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: unknown;
      };
      const detail = this.safeString(payload.detail).slice(0, 120);
      throw new UnprocessableEntityException(
        detail
          ? `录取截图识别失败：${detail}`
          : "录取截图识别失败，请换一张更清晰的截图后重试",
      );
    }

    return this.sanitizeRecognition(
      (await response.json()) as AdmissionRecognitionPayload,
    );
  }

  private sanitizeRecognition(
    value: AdmissionRecognitionPayload,
  ): SafeAdmissionRecognition {
    const fieldConfidences: Record<string, number> = {};
    if (
      value.fieldConfidences &&
      typeof value.fieldConfidences === "object" &&
      !Array.isArray(value.fieldConfidences)
    ) {
      for (const [key, raw] of Object.entries(value.fieldConfidences)) {
        if (typeof raw === "number" && Number.isFinite(raw)) {
          fieldConfidences[key] = this.clamp(raw, 0, 1);
        }
      }
    }
    return {
      batchName: this.safeString(value.batchName),
      examType: this.safeString(value.examType),
      levelName: this.safeString(value.levelName),
      universityCode: this.safeString(value.universityCode),
      universityName: this.safeString(value.universityName),
      groupCode: this.safeString(value.groupCode),
      majorCode: this.safeString(value.majorCode),
      majorName: this.safeString(value.majorName),
      queryTime: this.safeString(value.queryTime),
      confidence:
        typeof value.confidence === "number" &&
        Number.isFinite(value.confidence)
          ? this.clamp(value.confidence, 0, 1)
          : 0,
      fieldConfidences,
      warnings: Array.isArray(value.warnings)
        ? value.warnings.map((item) => this.safeString(item)).filter(Boolean)
        : [],
      source: this.safeString(value.source) || "ocr",
      identityMatch:
        typeof value.identityMatch === "boolean" ? value.identityMatch : null,
    };
  }

  private async resolveSubmissionSource(
    studentId: number,
    requestedId: number | undefined,
    requester: JwtPayloadUser,
  ): Promise<SubmissionSource | null> {
    let attachmentId = requestedId;
    if (attachmentId == null) {
      const latestPdf = await this.prisma.studentAttachment.findFirst({
        where: {
          studentId,
          category: "submission_screenshot",
          OR: [
            { mimeType: "application/pdf" },
            { originalName: { endsWith: ".pdf" } },
            { originalName: { endsWith: ".PDF" } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      attachmentId = latestPdf?.id;
    }
    if (attachmentId == null) return null;

    const source = await this.studentService.readAttachmentForAnalysis(
      studentId,
      attachmentId,
      "submission_screenshot",
      requester,
    );
    const isPdf =
      source.mimeType === "application/pdf" ||
      source.originalName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      throw new BadRequestException(
        "请使用该批次最终提交的志愿填报 PDF 进行匹配",
      );
    }
    return source;
  }

  private async resolveUniversity(recognized: SafeAdmissionRecognition) {
    if (recognized.universityCode) {
      const byCode = await this.prisma.university.findUnique({
        where: { code: recognized.universityCode },
        select: { id: true, code: true, name: true },
      });
      if (byCode) return byCode;
    }
    if (!recognized.universityName) return null;
    return this.prisma.university.findFirst({
      where: { name: recognized.universityName },
      select: { id: true, code: true, name: true },
    });
  }

  private async loadGroupCatalog(
    studentId: number,
    universityId: number | null,
    groupCode: string,
    batchName: string,
  ) {
    if (!universityId || !groupCode || !batchName) return [];
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { examYear: true, examType: true },
    });
    if (!student) throw new NotFoundException("学生不存在");
    if (!student.examYear) return [];
    const normalizedExamType = this.normalizeExamType(student.examType);
    if (!normalizedExamType) return [];
    const normalizedBatch = batchName.replace(/批次/g, "批");
    const batchShape = resolveBatchQueryShape(normalizedBatch);
    const subjects = normalizedExamType === "PHYSICS" ? "物理" : "历史";
    const rows = await this.prisma.enrollmentPlan.findMany({
      where: {
        universityId,
        groupCode,
        year: student.examYear,
        province: "四川",
        batch:
          batchShape.batches.length === 1
            ? batchShape.batches[0]
            : { in: batchShape.batches },
        ...(batchShape.recruitTypeContains
          ? { recruitType: { contains: batchShape.recruitTypeContains } }
          : {}),
        subjects,
      },
      select: { majorId: true, majorCode: true, majorName: true },
    });
    return rows.map((row) => ({
      majorId: row.majorId,
      code: row.majorCode,
      name: row.majorName,
    }));
  }

  private async getSubmissionSourceWarnings(
    studentId: number,
    explicitlySelected: boolean,
  ) {
    const pdfCount = await this.prisma.studentAttachment.count({
      where: {
        studentId,
        category: "submission_screenshot",
        OR: [
          { mimeType: "application/pdf" },
          { originalName: { endsWith: ".pdf" } },
          { originalName: { endsWith: ".PDF" } },
        ],
      },
    });
    if (pdfCount <= 1) return [];
    return [
      explicitlySelected
        ? "存在多份志愿填报 PDF，本次按老师选择的 PDF 匹配"
        : "存在多份志愿填报 PDF，本次按最新上传的 PDF 匹配",
    ];
  }

  private async getStudentAnalysisContext(
    studentId: number,
  ): Promise<StudentAnalysisContext> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: {
        examYear: true,
        examType: true,
        user: { select: { realName: true } },
      },
    });
    if (!student) throw new NotFoundException("学生不存在");
    return {
      realName: this.safeString(student.user?.realName),
      examYear: student.examYear ?? null,
      examType: student.examType ?? null,
    };
  }

  private async reserveAnalysisRevision(
    studentId: number,
    requester: JwtPayloadUser,
  ): Promise<{
    analysisRevision: number;
    analysisBaseline: AnalysisBaseline | null;
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        // Increment first to take an exclusive lock on this student's analysis
        // generation. If ownership or archive validation below fails, the whole
        // transaction rolls back and cannot cancel a legitimate analysis.
        const student = await tx.studentProfile.update({
          where: { id: studentId },
          data: { admissionAnalysisRevision: { increment: 1 } },
          select: {
            id: true,
            teacherId: true,
            userId: true,
            isArchived: true,
            admissionAnalysisRevision: true,
          },
        });
        this.studentService.assertStudentMutationWritable(student, requester);
        const analysisBaseline = await tx.studentAdmissionResult.findUnique({
          where: { studentId },
          select: {
            id: true,
            updatedAt: true,
            proofAttachmentId: true,
            submissionAttachmentId: true,
            matchConfirmedAt: true,
          },
        });
        return {
          analysisRevision: student.admissionAnalysisRevision,
          analysisBaseline,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private checkSubmissionIdentity(
    parsedForm: ParsedForm,
    expectedName: string,
  ): IdentityCheck {
    const parsedName = this.normalizePersonName(parsedForm.identity?.name);
    if (!parsedName) return "UNAVAILABLE";
    const profileName = this.normalizePersonName(expectedName);
    if (!profileName) return "UNAVAILABLE";
    return parsedName === profileName ? "MATCHED" : "MISMATCH";
  }

  private toIdentityCheck(value: boolean | null): IdentityCheck {
    return value === true
      ? "MATCHED"
      : value === false
        ? "MISMATCH"
        : "UNAVAILABLE";
  }

  private combineIdentityChecks(
    proof: IdentityCheck,
    submission: IdentityCheck,
  ): IdentityCheck {
    if (proof === "MISMATCH" || submission === "MISMATCH") return "MISMATCH";
    return proof === "MATCHED" && submission === "MATCHED"
      ? "MATCHED"
      : "UNAVAILABLE";
  }

  private identityWarnings(source: string, check: IdentityCheck): string[] {
    const sourceLabel = source.endsWith("PDF")
      ? `${source} 中的`
      : `${source}中的`;
    if (check === "MISMATCH") {
      return [`${sourceLabel}考生姓名与当前学生档案不一致`];
    }
    if (check === "UNAVAILABLE") {
      return [`无法核对${sourceLabel}考生姓名，请人工确认`];
    }
    return [];
  }

  private evaluateRecognitionReview(
    recognized: SafeAdmissionRecognition,
    university: { id: number; code: string | null; name: string } | null,
    student: StudentAnalysisContext,
  ): RecognitionReview {
    const warnings: string[] = [];
    if (!this.normalizeAdmissionLevel(recognized.batchName)) {
      warnings.push("录取批次未识别或无法核验，请人工确认");
    }
    const criticalFields: Array<{
      key: keyof SafeAdmissionRecognition;
      label: string;
    }> = [
      ...(recognized.batchName
        ? [{ key: "batchName" as const, label: "录取批次" }]
        : []),
      recognized.universityCode
        ? { key: "universityCode", label: "录取院校代码" }
        : { key: "universityName", label: "录取院校名称" },
      { key: "groupCode", label: "院校专业组代码" },
      recognized.majorCode
        ? { key: "majorCode", label: "录取专业代码" }
        : { key: "majorName", label: "录取专业名称" },
    ];
    for (const field of criticalFields) {
      const value = recognized[field.key];
      if (typeof value !== "string" || !value) continue;
      const confidence = this.recognitionFieldConfidence(recognized, field.key);
      if (confidence < 0.75) {
        warnings.push(`${field.label}识别置信度不足，请人工确认`);
      }
    }

    const hasRiskyOcrWarning = recognized.warnings.some((warning) =>
      /多个候选|代码含字母|冲突/.test(warning),
    );

    const recognizedCode = this.normalizeCode(recognized.universityCode);
    const recognizedName = this.normalizeName(recognized.universityName);
    const databaseCode = this.normalizeCode(university?.code);
    const databaseName = this.normalizeName(university?.name);
    if ((recognizedCode || recognizedName) && !university) {
      warnings.push("录取院校未能在院校库中核验，请人工确认");
    } else if (university) {
      if (recognizedCode && recognizedCode !== databaseCode) {
        warnings.push("录取院校代码与院校库记录不一致，请人工确认");
      }
      if (recognizedName && recognizedName !== databaseName) {
        warnings.push("录取院校名称与院校库记录不一致，请人工确认");
      }
    }

    const recognizedExamType = this.normalizeExamType(recognized.examType);
    const studentExamType = this.normalizeExamType(student.examType);
    if (student.examType && !studentExamType) {
      warnings.push("学生选科档案科类无法核验，请人工确认");
    } else if (studentExamType && !recognizedExamType) {
      warnings.push("录取截图科类未识别或无法核验，请人工确认");
    } else if (
      studentExamType &&
      recognizedExamType &&
      recognizedExamType !== studentExamType
    ) {
      warnings.push("录取截图科类与学生选科档案不一致，请人工确认");
    }

    const queryYear = Number(recognized.queryTime.match(/20\d{2}/)?.[0]);
    if (student.examYear == null) {
      warnings.push("学生高考年份缺失，无法核验录取查询年份，请人工确认");
    } else if (!Number.isInteger(queryYear)) {
      warnings.push("录取截图查询年份未识别或无法核验，请人工确认");
    } else if (queryYear !== student.examYear) {
      warnings.push("录取截图查询年份与学生高考年份不一致，请人工确认");
    }

    const recognizedLevel = this.normalizeAdmissionLevel(recognized.levelName);
    const batchLevel = this.normalizeAdmissionLevel(recognized.batchName);
    if (recognizedLevel && batchLevel && recognizedLevel !== batchLevel) {
      warnings.push("录取层次与录取批次不一致，请人工确认");
    }

    return {
      requiresReview: hasRiskyOcrWarning || warnings.length > 0,
      warnings: this.uniqueWarnings(warnings),
    };
  }

  private evaluateFormRecognitionConsistency(
    recognized: SafeAdmissionRecognition,
    parsedForm: ParsedForm,
    student: StudentAnalysisContext,
  ) {
    const warnings: string[] = [];
    const recognizedLevel = this.normalizeAdmissionLevel(recognized.levelName);
    const formLevel = this.normalizeAdmissionLevel(parsedForm.batch);
    if (!formLevel) {
      warnings.push("志愿填报 PDF 批次未识别或无法核验，请人工确认");
    } else if (recognizedLevel && recognizedLevel !== formLevel) {
      warnings.push("录取层次与志愿填报 PDF 批次不一致，请人工确认");
    }

    const recognizedExamType = this.normalizeExamType(recognized.examType);
    const formExamType = this.normalizeExamType(parsedForm.examTypeHint);
    const studentExamType = this.normalizeExamType(student.examType);
    if (
      recognizedExamType &&
      formExamType &&
      recognizedExamType !== formExamType
    ) {
      warnings.push("录取截图科类与志愿填报 PDF 科类不一致，请人工确认");
    }
    if (studentExamType && !formExamType) {
      warnings.push("志愿填报 PDF 科类未识别或无法核验，请人工确认");
    } else if (
      studentExamType &&
      formExamType &&
      studentExamType !== formExamType
    ) {
      warnings.push("志愿填报 PDF 科类与学生选科档案不一致，请人工确认");
    }
    return this.uniqueWarnings(warnings);
  }

  private normalizeExamType(value: string | null | undefined) {
    const normalized = (value ?? "").normalize("NFKC").toUpperCase();
    if (/PHYSICS|物理|理科/.test(normalized)) return "PHYSICS";
    if (/HISTORY|历史|文科/.test(normalized)) return "HISTORY";
    return null;
  }

  private normalizeAdmissionLevel(value: string | null | undefined) {
    const normalized = (value ?? "").normalize("NFKC");
    if (normalized.includes("本科")) return "UNDERGRADUATE";
    if (/专科|高职/.test(normalized)) return "VOCATIONAL";
    return null;
  }

  private recognitionFieldConfidence(
    recognized: SafeAdmissionRecognition,
    field: keyof SafeAdmissionRecognition,
  ): number {
    const aliases: Partial<
      Record<keyof SafeAdmissionRecognition, readonly string[]>
    > = {
      batchName: ["batchName", "batch_name"],
      universityCode: ["universityCode", "university_code"],
      universityName: ["universityName", "university_name"],
      groupCode: ["groupCode", "group_code"],
      majorCode: ["majorCode", "major_code"],
      majorName: ["majorName", "major_name"],
    };
    for (const key of aliases[field] ?? [String(field)]) {
      if (
        Object.prototype.hasOwnProperty.call(recognized.fieldConfidences, key)
      ) {
        return recognized.fieldConfidences[key];
      }
    }
    return recognized.confidence;
  }

  private uniqueWarnings(warnings: string[]) {
    return [...new Set(warnings.filter(Boolean))];
  }

  private buildCandidates(
    source: SubmissionSource,
    parsedForm: ParsedForm,
    match: AdmissionMatchResult,
  ): ResponseCandidate[] {
    const groups: AdmissionGroupCandidate[] = [...match.candidates];
    if (
      match.status === AdmissionMatchStatus.REVIEW_REQUIRED &&
      match.matchedGroup &&
      !groups.some(
        (candidate) => candidate.sequenceNo === match.matchedGroup?.seq,
      )
    ) {
      groups.push({
        sequenceNo: match.matchedGroup.seq,
        universityCode: match.matchedGroup.schoolCode,
        universityName: match.matchedGroup.schoolName,
        groupCode: match.matchedGroup.groupCode,
        reasons: [],
      });
    }
    return groups.map((candidate) => ({
      submissionAttachmentId: source.id,
      submissionAttachmentName: source.originalName,
      sequenceNo: candidate.sequenceNo,
      schoolCode: candidate.universityCode,
      schoolName: candidate.universityName,
      groupCode: candidate.groupCode,
      batchName: parsedForm.batch,
      reason:
        candidate.reasons.length > 0
          ? candidate.reasons
              .map((reason) =>
                reason === "SAME_UNIVERSITY_CODE"
                  ? "院校代码一致"
                  : "院校名称一致",
              )
              .join("、")
          : match.warnings.join("；"),
    }));
  }

  private matchMessage(
    status: AdmissionMatchStatus,
    match: AdmissionMatchResult,
  ) {
    if (status === AdmissionMatchStatus.EXACT) {
      return `已锁定第 ${match.sequenceNo} 个院校专业组志愿、第 ${match.majorSequenceNo} 个专业`;
    }
    if (status === AdmissionMatchStatus.ADJUSTED) {
      return `已锁定第 ${match.sequenceNo} 个院校专业组志愿；录取专业属于组内专业调剂`;
    }
    if (status === AdmissionMatchStatus.GROUP_NOT_FOUND) {
      return "当前志愿 PDF 中未找到该院校专业组，未锁定志愿顺序";
    }
    return "识别结果存在冲突或证据不完整，需要老师复核后确认";
  }

  private async persistAndBuildResponse(input: {
    studentId: number;
    proofAttachmentId: number;
    source: SubmissionSource | null;
    recognized: SafeAdmissionRecognition;
    university: { id: number; code: string | null; name: string } | null;
    matchStatus: ExtendedMatchStatus;
    message: string;
    warnings: string[];
    requester: JwtPayloadUser;
    parsedForm?: ParsedForm;
    parseSource?: "pdf-text" | "ocr";
    catalog?: Array<AdmissionCatalogMajor & { majorId?: number }>;
    match?: AdmissionMatchResult;
    candidates?: ResponseCandidate[];
    identityCheck?: IdentityCheck;
    proofIdentityCheck?: IdentityCheck;
    submissionIdentityCheck?: IdentityCheck;
    analysisBaseline: AnalysisBaseline | null;
    analysisRevision: number;
  }) {
    const match = input.match;
    const isLocked =
      input.matchStatus === AdmissionMatchStatus.EXACT ||
      input.matchStatus === AdmissionMatchStatus.ADJUSTED;
    const sequenceNo = isLocked ? (match?.sequenceNo ?? null) : null;
    const majorSequenceNo =
      input.matchStatus === AdmissionMatchStatus.EXACT
        ? (match?.majorSequenceNo ?? null)
        : null;
    const isAdjusted = input.matchStatus === AdmissionMatchStatus.ADJUSTED;
    const confidence = this.matchConfidence(
      input.recognized.confidence,
      input.matchStatus,
    );
    const admittedMajor = this.findVerifiedCatalogMajor(
      input.recognized,
      input.catalog ?? [],
    );
    const universityIdentityVerified = this.isUniversityIdentityVerified(
      input.recognized,
      input.university,
    );
    const admittedUniCode = universityIdentityVerified
      ? input.recognized.universityCode || null
      : null;
    const evidence = JSON.parse(
      JSON.stringify({
        version: this.parserVersion,
        recognition: {
          batchName: input.recognized.batchName,
          examType: input.recognized.examType,
          levelName: input.recognized.levelName,
          universityCode: input.recognized.universityCode,
          universityName: input.recognized.universityName,
          groupCode: input.recognized.groupCode,
          majorCode: input.recognized.majorCode,
          majorName: input.recognized.majorName,
          queryTime: input.recognized.queryTime,
          source: input.recognized.source,
          fieldConfidences: input.recognized.fieldConfidences,
        },
        submission: input.source
          ? {
              attachmentId: input.source.id,
              parserSource: input.parseSource ?? null,
              batchName: input.parsedForm?.batch ?? "",
              volunteerCount: input.parsedForm?.volunteers.length ?? 0,
            }
          : null,
        matchedGroup: match?.matchedGroup
          ? {
              sequenceNo: match.matchedGroup.seq,
              schoolCode: match.matchedGroup.schoolCode,
              schoolName: match.matchedGroup.schoolName,
              groupCode: match.matchedGroup.groupCode,
              majors: match.matchedGroup.majors.slice(0, 6).map((major) => ({
                code: major.code,
                name: major.name,
              })),
              acceptAdjust: match.matchedGroup.acceptAdjust,
            }
          : null,
        methods: match?.methods ?? [],
        identityCheck:
          input.identityCheck ?? input.proofIdentityCheck ?? "UNAVAILABLE",
        identityChecks: {
          admissionProof: input.proofIdentityCheck ?? "UNAVAILABLE",
          submissionPdf: input.submissionIdentityCheck ?? "UNAVAILABLE",
        },
        warnings: input.warnings,
        candidates: (input.candidates ?? []).map((candidate) => ({
          submissionAttachmentId: candidate.submissionAttachmentId,
          sequenceNo: candidate.sequenceNo,
          schoolCode: candidate.schoolCode,
          schoolName: candidate.schoolName,
          groupCode: candidate.groupCode,
          batchName: candidate.batchName,
          reason: candidate.reason,
        })),
      }),
    ) as Prisma.InputJsonValue;

    const analysisData = {
      admittedUniName: input.recognized.universityName,
      admittedUniCode,
      admittedUniId: universityIdentityVerified
        ? (input.university?.id ?? null)
        : null,
      proofAttachmentId: input.proofAttachmentId,
      batchName: input.recognized.batchName || input.parsedForm?.batch || null,
      admittedMajorGroupCode: input.recognized.groupCode || null,
      admittedMajorCode: input.recognized.majorCode || null,
      admittedMajorName: input.recognized.majorName || null,
      admittedMajorId: universityIdentityVerified
        ? (admittedMajor?.majorId ?? null)
        : null,
      sequenceNo,
      majorSequenceNo,
      isAdjusted,
      matchStatus: input.matchStatus,
      submissionAttachmentId: input.source?.id ?? null,
      matchConfidence: confidence,
      matchEvidence: evidence,
      recognizedAt: new Date(),
      matchConfirmedAt: null,
      matchConfirmedById: null,
    };

    const persisted = await this.prisma.$transaction(
      async (tx) => {
        // OCR 在事务外执行；落库前重新确认显式选择的附件仍存在，并用
        // 持久化 revision + 开始时数据库快照避免较慢的旧分析覆盖后发结果。
        const [proofStillExists, currentAdmissionResult, currentStudent] =
          await Promise.all([
            tx.studentAttachment.findFirst({
              where: {
                id: input.proofAttachmentId,
                studentId: input.studentId,
                category: "admission_proof",
              },
              select: { id: true },
            }),
            tx.studentAdmissionResult.findUnique({
              where: { studentId: input.studentId },
            }),
            tx.studentProfile.findUnique({
              where: { id: input.studentId },
              select: {
                id: true,
                teacherId: true,
                userId: true,
                isArchived: true,
                admissionAnalysisRevision: true,
              },
            }),
          ]);
        if (!currentStudent) throw new NotFoundException("学生不存在");
        this.studentService.assertStudentMutationWritable(
          currentStudent,
          input.requester,
        );
        if (!proofStillExists) throw new NotFoundException("录取截图已被删除");
        if (
          currentStudent.admissionAnalysisRevision !== input.analysisRevision ||
          !this.matchesAnalysisBaseline(
            currentAdmissionResult,
            input.analysisBaseline,
          )
        ) {
          return {
            superseded: true as const,
            admissionResult: currentAdmissionResult,
          };
        }
        if (input.source) {
          const sourceStillExists = await tx.studentAttachment.findFirst({
            where: {
              id: input.source.id,
              studentId: input.studentId,
              category: "submission_screenshot",
            },
            select: { id: true },
          });
          if (!sourceStillExists)
            throw new NotFoundException("志愿填报 PDF 已被删除");
        }

        // The attachment check above awaits I/O. Re-read the persistent
        // revision and ownership immediately before issuing the write. Under
        // SERIALIZABLE this row read also closes the final check/write window.
        const latestStudent = await tx.studentProfile.findUnique({
          where: { id: input.studentId },
          select: {
            id: true,
            teacherId: true,
            userId: true,
            isArchived: true,
            admissionAnalysisRevision: true,
          },
        });
        if (!latestStudent) throw new NotFoundException("学生不存在");
        this.studentService.assertStudentMutationWritable(
          latestStudent,
          input.requester,
        );
        if (
          latestStudent.admissionAnalysisRevision !== input.analysisRevision
        ) {
          return {
            superseded: true as const,
            admissionResult: currentAdmissionResult,
          };
        }

        const admissionResult = await tx.studentAdmissionResult.upsert({
          where: { studentId: input.studentId },
          create: { studentId: input.studentId, ...analysisData },
          update: analysisData,
        });
        return { superseded: false as const, admissionResult };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      proofAttachmentId: input.proofAttachmentId,
      submissionAttachmentId: input.source?.id ?? null,
      submissionAttachmentName: input.source?.originalName ?? null,
      matchStatus: input.matchStatus,
      message: persisted.superseded
        ? "已有更新的分析或人工确认结果，本次较早的识别结果未保存"
        : input.message,
      confidence,
      recognized: {
        batchName: input.recognized.batchName,
        admittedUniName: input.recognized.universityName,
        admittedUniCode,
        admittedMajorGroupCode: input.recognized.groupCode,
        admittedMajorCode: input.recognized.majorCode,
        admittedMajorName: input.recognized.majorName,
      },
      matched: { sequenceNo, majorSequenceNo, isAdjusted },
      candidates: input.candidates ?? [],
      warnings: input.warnings,
      superseded: persisted.superseded,
      admissionResult: persisted.admissionResult,
    };
  }

  private findVerifiedCatalogMajor(
    recognized: SafeAdmissionRecognition,
    catalog: Array<AdmissionCatalogMajor & { majorId?: number }>,
  ) {
    const code = this.normalizeCode(recognized.majorCode);
    if (code) {
      const codeMatches = catalog.filter(
        (major) => this.normalizeCode(major.code) === code,
      );
      if (codeMatches.length !== 1) return undefined;
      const recognizedName = this.normalizeName(recognized.majorName);
      const catalogName = this.normalizeName(codeMatches[0].name);
      if (recognizedName && (!catalogName || recognizedName !== catalogName)) {
        return undefined;
      }
      return codeMatches[0];
    }
    const name = this.normalizeName(recognized.majorName);
    if (!name) return undefined;
    const nameMatches = catalog.filter(
      (major) => this.normalizeName(major.name) === name,
    );
    return nameMatches.length === 1 ? nameMatches[0] : undefined;
  }

  private isUniversityIdentityVerified(
    recognized: SafeAdmissionRecognition,
    university: { code: string | null; name: string } | null,
  ) {
    if (!university) return false;
    const recognizedCode = this.normalizeCode(recognized.universityCode);
    const recognizedName = this.normalizeName(recognized.universityName);
    if (!recognizedCode && !recognizedName) return false;
    if (
      recognizedCode &&
      recognizedCode !== this.normalizeCode(university.code)
    ) {
      return false;
    }
    if (
      recognizedName &&
      recognizedName !== this.normalizeName(university.name)
    ) {
      return false;
    }
    return true;
  }

  private matchConfidence(ocrConfidence: number, status: ExtendedMatchStatus) {
    const factor =
      status === AdmissionMatchStatus.EXACT
        ? 1
        : status === AdmissionMatchStatus.ADJUSTED
          ? 0.9
          : status === AdmissionMatchStatus.REVIEW_REQUIRED
            ? 0.6
            : status === AdmissionMatchStatus.GROUP_NOT_FOUND
              ? 0.45
              : 0.3;
    return Math.round(this.clamp(ocrConfidence || 0.5, 0, 1) * factor * 100);
  }

  private matchesAnalysisBaseline(
    current: {
      id: number;
      updatedAt: Date;
      proofAttachmentId: number | null;
      submissionAttachmentId: number | null;
      matchConfirmedAt: Date | null;
    } | null,
    baseline: AnalysisBaseline | null,
  ) {
    if (!baseline || !current) return baseline === null && current === null;
    return (
      current.id === baseline.id &&
      current.updatedAt.getTime() === baseline.updatedAt.getTime() &&
      current.proofAttachmentId === baseline.proofAttachmentId &&
      current.submissionAttachmentId === baseline.submissionAttachmentId &&
      this.sameNullableDate(current.matchConfirmedAt, baseline.matchConfirmedAt)
    );
  }

  private sameNullableDate(left: Date | null, right: Date | null) {
    if (!left || !right) return left === null && right === null;
    return left.getTime() === right.getTime();
  }

  private safeString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private normalizeCode(value: string | null | undefined) {
    return (value ?? "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[\s\[\]【】()（）]/g, "");
  }

  private normalizeName(value: string | null | undefined) {
    return (value ?? "")
      .normalize("NFKC")
      .replace(/^\[[0-9A-Z]+\]/i, "")
      .replace(/[\s()（）【】\[\]]/g, "")
      .replace(/(?:师范类|师范)$/g, "");
  }

  private normalizePersonName(value: string | null | undefined) {
    return (value ?? "").normalize("NFKC").replace(/\s/g, "");
  }
}
