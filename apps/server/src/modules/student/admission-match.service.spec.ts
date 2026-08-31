import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { JwtPayloadUser } from "../casl/types";
import type {
  ParsedForm,
  ParsedVolunteer,
} from "../plan-import/volunteer-form.types";
import { AdmissionMatchStatus } from "./admission-match";
import { AdmissionMatchService } from "./admission-match.service";

// AdmissionMatchService only needs the StudentService injection token here.
// Avoid loading StudentService's native bcrypt dependency in this unit test.
jest.mock("./student.service", () => ({
  StudentService: class StudentService {},
}));

describe("AdmissionMatchService", () => {
  const requester: JwtPayloadUser = {
    id: 42,
    username: "teacher",
    role: "TEACHER",
    teacherProfileId: 7,
  };
  const proof = {
    id: 10,
    originalName: "admission.png",
    mimeType: "image/png",
    buffer: Buffer.from("proof"),
  };
  const submission = {
    id: 20,
    originalName: "submitted-volunteers.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf"),
  };
  const recognition = {
    batchName: "本科批B段",
    examType: "物理类",
    levelName: "本科",
    universityCode: "5122",
    universityName: "西华师范大学",
    groupCode: "105",
    majorCode: "32",
    majorName: "数学与应用数学",
    queryTime: "2026-07-28 13:53:53",
    confidence: 0.96,
    fieldConfidences: { universityCode: 0.99, majorCode: 0.98 },
    warnings: [],
    source: "ocr",
    identityMatch: true,
    // OCR adapters may return identity fields; the service must discard them.
    name: "不应保存的姓名",
    examNumber: "26510108150000",
    idMasked: "510101****1234",
  };

  let service: AdmissionMatchService;
  let prisma: any;
  let tx: any;
  let config: any;
  let studentService: any;
  let volunteerFormParser: any;
  let fetchMock: jest.Mock;
  let analysisRevision: number;
  const originalFetch = global.fetch;

  function group(overrides: Partial<ParsedVolunteer> = {}): ParsedVolunteer {
    return {
      seq: 18,
      schoolCode: "5122",
      schoolName: "西华师范大学",
      groupCode: "105",
      majors: [
        { code: "32", name: "数学与应用数学(师范)" },
        { code: "60", name: "化学(师范)" },
        { code: "67", name: "物理学(师范)" },
        { code: "77", name: "网络空间安全" },
        { code: "07", name: "科学教育(师范)" },
        { code: "33", name: "统计学" },
      ],
      acceptAdjust: true,
      ...overrides,
    };
  }

  function parsedForm(
    volunteers: ParsedVolunteer[] = [group()],
    batch = "本科批次B段",
  ): ParsedForm {
    return {
      identity: {
        name: "不应保存的姓名",
        examNumber: "26510108150000",
        classInfo: "10班",
        idMasked: "510101****1234",
      },
      batch,
      examTypeHint: "PHYSICS",
      volunteers,
    };
  }

  function persistedFromUpsert(args: any) {
    return {
      id: 100,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
      updatedAt: new Date("2026-08-31T00:00:00.000Z"),
      scoreDiff: null,
      ...args.create,
    };
  }

  beforeEach(() => {
    analysisRevision = 0;
    tx = {
      studentProfile: {
        update: jest.fn(async () => ({
          id: 1,
          teacherId: 7,
          userId: 100,
          isArchived: false,
          admissionAnalysisRevision: ++analysisRevision,
        })),
        findUnique: jest.fn(async () => ({
          id: 1,
          teacherId: 7,
          userId: 100,
          isArchived: false,
          admissionAnalysisRevision: analysisRevision,
        })),
      },
      studentAttachment: {
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          if (where.id != null) return { id: where.id };
          if (where.category === "admission_proof" && orderBy) {
            return { id: proof.id };
          }
          return null;
        }),
      },
      studentAdmissionResult: {
        upsert: jest.fn(async (args: any) => persistedFromUpsert(args)),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prisma = {
      university: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5122,
          code: "5122",
          name: "西华师范大学",
        }),
        findFirst: jest.fn(),
      },
      studentAttachment: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
      },
      studentProfile: {
        findUnique: jest.fn().mockImplementation(({ select }: any) =>
          select?.user
            ? Promise.resolve({
                examYear: 2026,
                examType: "PHYSICS",
                user: { realName: "不应保存的姓名" },
              })
            : Promise.resolve({ examYear: 2026, examType: "PHYSICS" }),
        ),
      },
      studentAdmissionResult: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      enrollmentPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            majorId: 3200,
            majorCode: "32",
            majorName: "数学与应用数学(师范)",
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
    };
    config = {
      get: jest.fn().mockReturnValue("http://ocr.test"),
    };
    studentService = {
      assertStudentMutationWritable: jest.fn(
        (profile: any, currentRequester: JwtPayloadUser) => {
          if (profile.isArchived) {
            throw new ConflictException(
              "学生已归档，不能再修改录取材料或录取结果",
            );
          }
          if (currentRequester.role === "ADMIN") return;
          if (
            currentRequester.role === "TEACHER" &&
            currentRequester.teacherProfileId != null &&
            profile.teacherId === currentRequester.teacherProfileId
          ) {
            return;
          }
          throw new ForbiddenException("无权修改不属于自己的学生资料");
        },
      ),
      readAttachmentForAnalysis: jest.fn(
        async (_studentId: number, _attachmentId: number, category: string) =>
          category === "admission_proof" ? proof : submission,
      ),
    };
    volunteerFormParser = {
      parseAttachment: jest.fn().mockResolvedValue({
        form: parsedForm(),
        source: "pdf-text",
      }),
    };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(recognition),
    });
    global.fetch = fetchMock as typeof fetch;
    service = new AdmissionMatchService(
      prisma,
      config,
      studentService,
      volunteerFormParser,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function updateData() {
    expect(tx.studentAdmissionResult.upsert).toHaveBeenCalledTimes(1);
    return tx.studentAdmissionResult.upsert.mock.calls[0][0].update;
  }

  function expectNoIdentity(value: unknown) {
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("不应保存的姓名");
    expect(serialized).not.toContain("26510108150000");
    expect(serialized).not.toContain("510101****1234");
    expect(serialized).not.toContain("classInfo");
    expect(serialized).not.toContain("examNumber");
    expect(serialized).not.toContain("idMasked");
  }

  it("EXACT 持久化第 18 志愿、第 1 专业，响应和数据库均不含身份字段", async () => {
    const result = await service.analyze(
      1,
      { proofAttachmentId: proof.id, submissionAttachmentId: submission.id },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: AdmissionMatchStatus.EXACT,
      superseded: false,
      matched: {
        sequenceNo: 18,
        majorSequenceNo: 1,
        isAdjusted: false,
      },
      recognized: {
        admittedUniCode: "5122",
        admittedMajorCode: "32",
      },
    });
    const data = updateData();
    expect(data).toMatchObject({
      sequenceNo: 18,
      majorSequenceNo: 1,
      isAdjusted: false,
      matchStatus: AdmissionMatchStatus.EXACT,
      admittedUniId: 5122,
      admittedMajorId: 3200,
      proofAttachmentId: 10,
      submissionAttachmentId: 20,
    });
    expectNoIdentity(result);
    expectNoIdentity(data);
    const request = fetchMock.mock.calls[0][1];
    expect((request.body as FormData).get("expected_name")).toBe(
      "不应保存的姓名",
    );
  });

  it("ADJUSTED 只持久化院校专业组顺序，专业顺序为 null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        majorCode: "88",
        majorName: "人工智能",
      }),
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      {
        majorId: 3200,
        majorCode: "32",
        majorName: "数学与应用数学(师范)",
      },
      { majorId: 6000, majorCode: "60", majorName: "化学(师范)" },
      { majorId: 6700, majorCode: "67", majorName: "物理学(师范)" },
      { majorId: 7700, majorCode: "77", majorName: "网络空间安全" },
      { majorId: 700, majorCode: "07", majorName: "科学教育(师范)" },
      { majorId: 3300, majorCode: "33", majorName: "统计学" },
      { majorId: 8800, majorCode: "88", majorName: "人工智能" },
    ]);

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: AdmissionMatchStatus.ADJUSTED,
      matched: {
        sequenceNo: 18,
        majorSequenceNo: null,
        isAdjusted: true,
      },
    });
    expect(updateData()).toMatchObject({
      sequenceNo: 18,
      majorSequenceNo: null,
      isAdjusted: true,
      matchStatus: AdmissionMatchStatus.ADJUSTED,
      admittedMajorId: 8800,
    });
  });

  it("审计证据不保存可能含姓名或考号的附件文件名", async () => {
    studentService.readAttachmentForAnalysis.mockImplementation(
      async (_studentId: number, _attachmentId: number, category: string) =>
        category === "admission_proof"
          ? proof
          : {
              ...submission,
              originalName: "袁嘉_26510108150000_志愿表.pdf",
            },
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        groupCode: "106",
      }),
    });

    await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    const evidence = JSON.stringify(updateData().matchEvidence);
    expect(evidence).not.toContain("袁嘉");
    expect(evidence).not.toContain("26510108150000");
    expect(evidence).not.toContain("submissionAttachmentName");
    expect(evidence).not.toContain("fileName");
  });

  it.each([
    {
      label: "显式选择",
      dto: { proofAttachmentId: 10, submissionAttachmentId: 20 },
      prepare: () => undefined,
      warning: "存在多份志愿填报 PDF，本次按老师选择的 PDF 匹配",
    },
    {
      label: "未显式选择",
      dto: { proofAttachmentId: 10 },
      prepare: () =>
        prisma.studentAttachment.findFirst.mockResolvedValue({ id: 20 }),
      warning: "存在多份志愿填报 PDF，本次按最新上传的 PDF 匹配",
    },
  ])("多份 PDF 且$label时准确说明本次来源", async (scenario) => {
    prisma.studentAttachment.count.mockResolvedValue(2);
    scenario.prepare();

    const result = await service.analyze(1, scenario.dto, requester);

    expect(result.matchStatus).toBe(AdmissionMatchStatus.EXACT);
    expect(result.warnings).toContain(scenario.warning);
  });

  it.each([
    {
      label: "GROUP_NOT_FOUND",
      recognizedPatch: { groupCode: "106" },
      parsedBatch: "本科批次B段",
      status: AdmissionMatchStatus.GROUP_NOT_FOUND,
      expectedWarning:
        "未匹配到院校专业组，请核对录取批次、最终提交 PDF 版本、OCR 识别结果，并确认是否属于征集志愿或补录",
    },
    {
      label: "REVIEW_REQUIRED",
      recognizedPatch: { batchName: "本科批A段" },
      parsedBatch: "本科批次B段",
      status: AdmissionMatchStatus.REVIEW_REQUIRED,
      expectedWarning: null,
    },
  ])("$label 不向响应或数据库写入任何志愿顺序", async (scenario) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        ...scenario.recognizedPatch,
      }),
    });
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: parsedForm([group()], scenario.parsedBatch),
      source: "pdf-text",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(scenario.status);
    if (scenario.expectedWarning) {
      expect(result.warnings).toContain(scenario.expectedWarning);
    }
    expect(result.matched).toEqual({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
    expect(updateData()).toMatchObject({
      sequenceNo: null,
      majorSequenceNo: null,
      matchStatus: scenario.status,
    });
  });

  it("志愿 PDF 姓名与学生档案不一致时降级复核且不泄露双方姓名", async () => {
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: {
        ...parsedForm(),
        identity: {
          ...parsedForm().identity,
          name: "李师范",
        },
      },
      source: "pdf-text",
    });
    prisma.studentProfile.findUnique
      .mockResolvedValueOnce({
        examYear: 2026,
        examType: "PHYSICS",
        user: { realName: "李" },
      })
      .mockResolvedValueOnce({ examYear: 2026, examType: "PHYSICS" });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched).toEqual({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
    expect(result.warnings).toContain(
      "志愿填报 PDF 中的考生姓名与当前学生档案不一致",
    );
    expect(JSON.stringify(result)).not.toContain("李师范");
    expect(JSON.stringify(result)).not.toContain('"李"');
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it("志愿 PDF 姓名无法核验时降级复核且不写入志愿顺序", async () => {
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: {
        ...parsedForm(),
        identity: {
          name: "",
          examNumber: "26510108150000",
          classInfo: "10班",
          idMasked: "510101****1234",
        },
      },
      source: "pdf-text",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      matched: {
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      },
    });
    expect(result.warnings).toContain(
      "无法核对志愿填报 PDF 中的考生姓名，请人工确认",
    );
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it("专业匹配证据不足导致复核时清空已命中的院校专业组顺序", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        majorCode: "88",
        majorName: "人工智能",
      }),
    });
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: parsedForm([
        group({
          majors: group().majors.slice(0, 5),
        }),
      ]),
      source: "pdf-text",
    });
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { majorId: 8800, majorCode: "88", majorName: "人工智能" },
    ]);

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      matched: {
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      },
    });
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it.each([
    {
      label: "姓名不一致",
      identityMatch: false,
      evidence: "MISMATCH",
      warning: "录取截图中的考生姓名与当前学生档案不一致",
    },
    {
      label: "姓名无法识别",
      identityMatch: null,
      evidence: "UNAVAILABLE",
      warning: "无法核对录取截图中的考生姓名，请人工确认",
    },
  ])("录取截图$label时必须复核且不锁定顺序", async (scenario) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        identityMatch: scenario.identityMatch,
      }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      matched: {
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      },
    });
    expect(result.warnings).toContain(scenario.warning);
    const data = updateData();
    expect(data).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
      matchEvidence: {
        identityChecks: {
          admissionProof: scenario.evidence,
          submissionPdf: "MATCHED",
        },
      },
    });
    expectNoIdentity(result);
    expectNoIdentity(data);
  });

  it("关键匹配字段单项置信度低于门槛时降级复核", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        fieldConfidences: {
          ...recognition.fieldConfidences,
          groupCode: 0.74,
        },
      }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched.sequenceNo).toBeNull();
    expect(result.warnings).toContain(
      "院校专业组代码识别置信度不足，请人工确认",
    );
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it("没有单字段置信度时使用高 overall confidence，不误伤精确匹配", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        confidence: 0.96,
        fieldConfidences: {},
      }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.EXACT);
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.EXACT,
      sequenceNo: 18,
      majorSequenceNo: 1,
    });
  });

  it("录取批次缺失时即使院校、组和专业代码全命中也必须复核", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ...recognition, batchName: "" }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.warnings).toContain("录取批次未识别或无法核验，请人工确认");
    expect(result.matched).toEqual({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it.each(["", "未知批次"])(
    "志愿 PDF 批次为 %p 时即使代码全命中也必须复核",
    async (pdfBatch) => {
      volunteerFormParser.parseAttachment.mockResolvedValue({
        form: parsedForm([group()], pdfBatch),
        source: "pdf-text",
      });

      const result = await service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 20 },
        requester,
      );

      expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
      expect(result.warnings).toContain(
        "志愿填报 PDF 批次未识别或无法核验，请人工确认",
      );
      expect(result.matched).toEqual({
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      });
    },
  );

  it("OCR 缺院校代码但高置信校名能在数据库核验时不误伤匹配", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        universityCode: "",
        fieldConfidences: {
          universityName: 0.92,
          groupCode: 0.91,
          majorCode: 0.9,
          batchName: 0.9,
        },
      }),
    });
    prisma.university.findFirst.mockResolvedValue({
      id: 5122,
      code: "5122",
      name: "西华师范大学",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.EXACT);
    expect(updateData()).toMatchObject({
      admittedUniCode: "5122",
      sequenceNo: 18,
      majorSequenceNo: 1,
    });
  });

  it.each([
    {
      label: "OCR 存在多个候选",
      prepare: () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            ...recognition,
            warnings: ["录取院校存在多个候选值，请核对"],
          }),
        });
      },
      warning: "录取院校存在多个候选值，请核对",
      expectedUniId: 5122,
      expectedUniCode: "5122",
    },
    {
      label: "院校代码与名称指向不同数据库记录",
      prepare: () => {
        prisma.university.findUnique.mockResolvedValue({
          id: 5122,
          code: "5122",
          name: "四川大学",
        });
      },
      warning: "录取院校名称与院校库记录不一致，请人工确认",
      expectedUniId: null,
      expectedUniCode: null,
    },
  ])("$label 时降级复核", async (scenario) => {
    scenario.prepare();

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched.sequenceNo).toBeNull();
    expect(result.warnings).toContain(scenario.warning);
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
      admittedUniId: scenario.expectedUniId,
      admittedUniCode: scenario.expectedUniCode,
      admittedMajorId: scenario.expectedUniId == null ? null : 3200,
    });
  });

  it("院校由名称命中但 OCR 代码冲突时不落关联 ID 或隐藏代码，证据仍保留原代码", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        universityCode: "9999",
      }),
    });
    prisma.university.findUnique.mockResolvedValue(null);
    prisma.university.findFirst.mockResolvedValue({
      id: 5122,
      code: "5122",
      name: "西华师范大学",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.recognized.admittedUniCode).toBeNull();
    const data = updateData();
    expect(data).toMatchObject({
      admittedUniCode: null,
      admittedUniId: null,
      admittedMajorId: null,
    });
    expect(data.matchEvidence.recognition.universityCode).toBe("9999");
  });

  it("专业代码命中目录但专业名称冲突时不落专业关联 ID", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        majorName: "临床医学",
      }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(updateData()).toMatchObject({ admittedMajorId: null });
  });

  it.each([
    {
      label: "OCR 科类与学生选科冲突",
      recognitionPatch: { examType: "历史类" },
      parsedBatch: "本科批次B段",
      warning: "录取截图科类与学生选科档案不一致，请人工确认",
    },
    {
      label: "查询年份与高考年份冲突",
      recognitionPatch: { queryTime: "2025-07-28 13:53:53" },
      parsedBatch: "本科批次B段",
      warning: "录取截图查询年份与学生高考年份不一致，请人工确认",
    },
    {
      label: "截图查询年份缺失",
      recognitionPatch: { queryTime: "" },
      parsedBatch: "本科批次B段",
      warning: "录取截图查询年份未识别或无法核验，请人工确认",
    },
    {
      label: "录取层次与截图批次冲突",
      recognitionPatch: { levelName: "专科" },
      parsedBatch: "本科批次B段",
      warning: "录取层次与录取批次不一致，请人工确认",
    },
    {
      label: "录取层次与志愿 PDF 批次冲突",
      recognitionPatch: { levelName: "本科", batchName: "" },
      parsedBatch: "专科批次",
      warning: "录取层次与志愿填报 PDF 批次不一致，请人工确认",
    },
  ])("$label 时不锁定任何顺序", async (scenario) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        ...scenario.recognitionPatch,
      }),
    });
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: parsedForm([group()], scenario.parsedBatch),
      source: "pdf-text",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched).toEqual({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
    expect(result.warnings).toContain(scenario.warning);
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: null,
      majorSequenceNo: null,
    });
  });

  it("学生高考年份缺失时不得自动锁定", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(recognition),
    });
    prisma.studentProfile.findUnique.mockImplementation(({ select }: any) =>
      select?.user
        ? Promise.resolve({
            examYear: null,
            examType: "PHYSICS",
            user: { realName: "不应保存的姓名" },
          })
        : Promise.resolve({ examYear: null, examType: "PHYSICS" }),
    );

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched.sequenceNo).toBeNull();
    expect(result.warnings).toContain(
      "学生高考年份缺失，无法核验录取查询年份，请人工确认",
    );
  });

  it("学生科类缺失时不跨科类加载目录，也不能自动判定调剂", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ...recognition,
        majorCode: "88",
        majorName: "人工智能",
      }),
    });
    prisma.studentProfile.findUnique.mockImplementation(({ select }: any) =>
      select?.user
        ? Promise.resolve({
            examYear: 2026,
            examType: null,
            user: { realName: "不应保存的姓名" },
          })
        : Promise.resolve({ examYear: 2026, examType: null }),
    );
    prisma.enrollmentPlan.findMany.mockResolvedValue([
      { majorId: 8800, majorCode: "88", majorName: "人工智能" },
    ]);

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.matched.sequenceNo).toBeNull();
    expect(prisma.enrollmentPlan.findMany).not.toHaveBeenCalled();
    expect(updateData()).toMatchObject({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
  });

  it("录取截图科类与志愿 PDF 科类冲突时不锁定任何顺序", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ...recognition, examType: "历史类" }),
    });
    prisma.studentProfile.findUnique.mockImplementation(({ select }: any) =>
      select?.user
        ? Promise.resolve({
            examYear: 2026,
            examType: "HISTORY",
            user: { realName: "不应保存的姓名" },
          })
        : Promise.resolve({ examYear: 2026, examType: "HISTORY" }),
    );

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.warnings).toContain(
      "录取截图科类与志愿填报 PDF 科类不一致，请人工确认",
    );
    expect(result.matched).toEqual({
      sequenceNo: null,
      majorSequenceNo: null,
      isAdjusted: false,
    });
  });

  it("学生已有科类但录取截图科类缺失时必须复核", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ...recognition, examType: "" }),
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.warnings).toContain(
      "录取截图科类未识别或无法核验，请人工确认",
    );
    expect(result.matched.sequenceNo).toBeNull();
  });

  it("学生已有科类但志愿 PDF 科类缺失时必须复核", async () => {
    volunteerFormParser.parseAttachment.mockResolvedValue({
      form: { ...parsedForm(), examTypeHint: undefined },
      source: "pdf-text",
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.matchStatus).toBe(AdmissionMatchStatus.REVIEW_REQUIRED);
    expect(result.warnings).toContain(
      "志愿填报 PDF 科类未识别或无法核验，请人工确认",
    );
    expect(result.matched.sequenceNo).toBeNull();
  });

  it("未找到志愿填报 PDF 时返回并持久化 FORM_NOT_FOUND", async () => {
    prisma.studentAttachment.findFirst.mockResolvedValue(null);

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: "FORM_NOT_FOUND",
      submissionAttachmentId: null,
      matched: {
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      },
    });
    expect(updateData()).toMatchObject({
      matchStatus: "FORM_NOT_FOUND",
      sequenceNo: null,
      majorSequenceNo: null,
      submissionAttachmentId: null,
    });
    expect(volunteerFormParser.parseAttachment).not.toHaveBeenCalled();
  });

  it("志愿填报 PDF 解析失败时返回并持久化 PARSE_FAILED", async () => {
    volunteerFormParser.parseAttachment.mockRejectedValue(
      new Error("broken pdf"),
    );

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result).toMatchObject({
      matchStatus: "PARSE_FAILED",
      matched: {
        sequenceNo: null,
        majorSequenceNo: null,
        isAdjusted: false,
      },
    });
    expect(updateData()).toMatchObject({
      matchStatus: "PARSE_FAILED",
      sequenceNo: null,
      majorSequenceNo: null,
      submissionAttachmentId: 20,
    });
    expect(prisma.enrollmentPlan.findMany).not.toHaveBeenCalled();
  });

  it("老师显式选择较旧录取截图时仍允许分析，不强制替换成最新截图", async () => {
    tx.studentAttachment.findFirst.mockImplementation(
      async ({ where, orderBy }: any) => {
        if (where.id != null) return { id: where.id };
        if (where.category === "admission_proof" && orderBy) {
          return { id: 11 };
        }
        return null;
      },
    );
    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.superseded).toBe(false);
    expect(updateData()).toMatchObject({
      proofAttachmentId: 10,
      sequenceNo: 18,
      majorSequenceNo: 1,
    });
  });

  it("持久化时数据库 revision 已被后发分析推进则返回 superseded 且不写入", async () => {
    tx.studentProfile.findUnique.mockResolvedValue({
      id: 1,
      teacherId: 7,
      userId: 100,
      isArchived: false,
      admissionAnalysisRevision: 2,
    });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.superseded).toBe(true);
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("OCR 期间学生转交给其他老师时，原老师不得落库", async () => {
    tx.studentProfile.findUnique.mockResolvedValue({
      id: 1,
      teacherId: 99,
      userId: 100,
      isArchived: false,
      admissionAnalysisRevision: 1,
    });

    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 20 },
        requester,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("同一录取截图的后发 PDF 分析已落库时，慢分析不得覆盖", async () => {
    const startedAt = new Date("2026-08-31T08:00:00.000Z");
    const baseline = {
      id: 100,
      updatedAt: startedAt,
      proofAttachmentId: 10,
      submissionAttachmentId: 20,
      matchConfirmedAt: null,
    };
    tx.studentAdmissionResult.findUnique
      .mockResolvedValueOnce(baseline)
      .mockResolvedValue({
        ...baseline,
        updatedAt: new Date("2026-08-31T08:00:01.000Z"),
        submissionAttachmentId: 21,
        matchStatus: AdmissionMatchStatus.EXACT,
        sequenceNo: 3,
        majorSequenceNo: 2,
      });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.superseded).toBe(true);
    expect(result.admissionResult).toMatchObject({
      submissionAttachmentId: 21,
      sequenceNo: 3,
      majorSequenceNo: 2,
    });
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("后发分析推进持久化 revision 后，先发慢请求即使 baseline 未变也不得覆盖", async () => {
    let markFirstFetchStarted!: () => void;
    let releaseFirstFetch!: (value: unknown) => void;
    const firstFetchStarted = new Promise<void>((resolve) => {
      markFirstFetchStarted = resolve;
    });
    const firstFetchResponse = new Promise((resolve) => {
      releaseFirstFetch = resolve;
    });
    fetchMock
      .mockImplementationOnce(() => {
        markFirstFetchStarted();
        return firstFetchResponse;
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(recognition),
      });

    const first = service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );
    await firstFetchStarted;

    const second = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );
    expect(second.superseded).toBe(false);

    releaseFirstFetch({
      ok: true,
      json: jest.fn().mockResolvedValue(recognition),
    });
    const staleFirst = await first;

    expect(staleFirst.superseded).toBe(true);
    expect(tx.studentAdmissionResult.upsert).toHaveBeenCalledTimes(1);
  });

  it("未授权老师的失败请求不会推进 revision 或取消正在执行的合法分析", async () => {
    let markAuthorizedFetchStarted!: () => void;
    let releaseAuthorizedFetch!: (value: unknown) => void;
    const authorizedFetchStarted = new Promise<void>((resolve) => {
      markAuthorizedFetchStarted = resolve;
    });
    const blockedAuthorizedFetch = new Promise((resolve) => {
      releaseAuthorizedFetch = resolve;
    });
    fetchMock.mockImplementationOnce(() => {
      markAuthorizedFetchStarted();
      return blockedAuthorizedFetch;
    });

    const authorized = service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );
    await authorizedFetchStarted;

    tx.studentProfile.update.mockImplementationOnce(async () => ({
      id: 1,
      teacherId: 7,
      userId: 100,
      isArchived: false,
      admissionAnalysisRevision: analysisRevision + 1,
    }));
    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 20 },
        { ...requester, id: 99, teacherProfileId: 999 },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.studentProfile.update).toHaveBeenCalledTimes(2);

    releaseAuthorizedFetch({
      ok: true,
      json: jest.fn().mockResolvedValue(recognition),
    });
    const result = await authorized;
    expect(result.superseded).toBe(false);
    expect(tx.studentAdmissionResult.upsert).toHaveBeenCalledTimes(1);
  });

  it("后发请求在旧请求校验 PDF 的等待窗口启动时，写入前令牌复核仍能阻止旧结果", async () => {
    let markSourceCheckStarted!: () => void;
    let releaseSourceCheck!: (value: unknown) => void;
    const sourceCheckStarted = new Promise<void>((resolve) => {
      markSourceCheckStarted = resolve;
    });
    const blockedSourceCheck = new Promise((resolve) => {
      releaseSourceCheck = resolve;
    });
    let blockFirstSourceCheck = true;
    tx.studentAttachment.findFirst.mockImplementation(
      ({ where, orderBy }: any) => {
        if (where.category === "admission_proof" && orderBy) {
          return Promise.resolve({ id: proof.id });
        }
        if (
          where.category === "submission_screenshot" &&
          where.id != null &&
          blockFirstSourceCheck
        ) {
          blockFirstSourceCheck = false;
          markSourceCheckStarted();
          return blockedSourceCheck;
        }
        if (where.id != null) return Promise.resolve({ id: where.id });
        return Promise.resolve(null);
      },
    );

    const first = service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );
    await sourceCheckStarted;

    let markSecondFetchStarted!: () => void;
    let releaseSecondFetch!: (value: unknown) => void;
    const secondFetchStarted = new Promise<void>((resolve) => {
      markSecondFetchStarted = resolve;
    });
    const blockedSecondFetch = new Promise((resolve) => {
      releaseSecondFetch = resolve;
    });
    fetchMock.mockImplementationOnce(() => {
      markSecondFetchStarted();
      return blockedSecondFetch;
    });
    const second = service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );
    await secondFetchStarted;

    releaseSourceCheck({ id: 20 });
    const staleFirst = await first;
    expect(staleFirst.superseded).toBe(true);
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();

    releaseSecondFetch({
      ok: true,
      json: jest.fn().mockResolvedValue(recognition),
    });
    const latestSecond = await second;
    expect(latestSecond.superseded).toBe(false);
    expect(tx.studentAdmissionResult.upsert).toHaveBeenCalledTimes(1);
  });

  it("分析期间老师已保存确认时，慢分析不得覆盖人工结果", async () => {
    const baseline = {
      id: 100,
      updatedAt: new Date("2026-08-31T08:00:00.000Z"),
      proofAttachmentId: 10,
      submissionAttachmentId: 20,
      matchConfirmedAt: null,
    };
    tx.studentAdmissionResult.findUnique
      .mockResolvedValueOnce(baseline)
      .mockResolvedValue({
        ...baseline,
        updatedAt: new Date("2026-08-31T08:00:01.000Z"),
        matchConfirmedAt: new Date("2026-08-31T08:00:01.000Z"),
        matchConfirmedById: 42,
        matchStatus: "MANUAL_CONFIRMED",
        sequenceNo: 6,
        majorSequenceNo: 4,
      });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.superseded).toBe(true);
    expect(result.admissionResult).toMatchObject({
      matchStatus: "MANUAL_CONFIRMED",
      sequenceNo: 6,
      majorSequenceNo: 4,
    });
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("老师确认后主动发起的新分析允许生成新的未确认草稿", async () => {
    const confirmedAt = new Date("2026-08-31T08:00:00.000Z");
    const baseline = {
      id: 100,
      updatedAt: confirmedAt,
      proofAttachmentId: 10,
      submissionAttachmentId: 20,
      matchConfirmedAt: confirmedAt,
    };
    tx.studentAdmissionResult.findUnique
      .mockResolvedValueOnce(baseline)
      .mockResolvedValue({
        ...baseline,
        matchStatus: "MANUAL_CONFIRMED",
        sequenceNo: 6,
        majorSequenceNo: 4,
      });

    const result = await service.analyze(
      1,
      { proofAttachmentId: 10, submissionAttachmentId: 20 },
      requester,
    );

    expect(result.superseded).toBe(false);
    expect(updateData()).toMatchObject({
      matchStatus: AdmissionMatchStatus.EXACT,
      matchConfirmedAt: null,
      matchConfirmedById: null,
    });
  });

  it("跨学生的录取截图由 readAttachmentForAnalysis 拒绝并原样抛出", async () => {
    studentService.readAttachmentForAnalysis.mockRejectedValueOnce(
      new NotFoundException("附件不存在"),
    );

    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 999, submissionAttachmentId: 20 },
        requester,
      ),
    ).rejects.toThrow("附件不存在");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("已归档学生由附件分析门禁拒绝，不能重新分析覆盖历史结果", async () => {
    tx.studentProfile.update.mockResolvedValueOnce({
      id: 1,
      teacherId: 7,
      userId: 100,
      isArchived: true,
      admissionAnalysisRevision: 1,
    });

    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 20 },
        requester,
      ),
    ).rejects.toThrow(ConflictException);
    expect(studentService.readAttachmentForAnalysis).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("分析开始后学生被归档时，持久化事务内复查阻止覆盖历史结果", async () => {
    tx.studentProfile.findUnique.mockResolvedValue({ isArchived: true });

    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 20 },
        requester,
      ),
    ).rejects.toThrow(ConflictException);
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });

  it("错误类别的志愿附件由 readAttachmentForAnalysis 拒绝，不解析也不落库", async () => {
    studentService.readAttachmentForAnalysis.mockImplementation(
      async (_studentId: number, _attachmentId: number, category: string) => {
        if (category === "admission_proof") return proof;
        throw new BadRequestException("附件类别不匹配");
      },
    );

    await expect(
      service.analyze(
        1,
        { proofAttachmentId: 10, submissionAttachmentId: 999 },
        requester,
      ),
    ).rejects.toThrow("附件类别不匹配");
    expect(volunteerFormParser.parseAttachment).not.toHaveBeenCalled();
    expect(tx.studentAdmissionResult.upsert).not.toHaveBeenCalled();
  });
});
