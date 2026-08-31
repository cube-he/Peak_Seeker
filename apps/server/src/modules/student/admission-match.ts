import type {
  ParsedForm,
  ParsedMajor,
  ParsedVolunteer,
} from "../plan-import/volunteer-form.types";

export interface RecognizedAdmission {
  batchName?: string | null;
  universityCode?: string | null;
  universityName?: string | null;
  groupCode?: string | null;
  majorCode?: string | null;
  majorName?: string | null;
}

export enum AdmissionMatchStatus {
  EXACT = "EXACT",
  ADJUSTED = "ADJUSTED",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  GROUP_NOT_FOUND = "GROUP_NOT_FOUND",
}

export interface AdmissionCatalogMajor {
  code?: string | null;
  name?: string | null;
}

export interface AdmissionMatchOptions {
  /**
   * The complete major catalog for the recognized university group. This is
   * deliberately separate from the six submitted majors: adjustment can only
   * be asserted when the admitted major is known to belong to the same group.
   */
  groupCatalogMajors?: readonly AdmissionCatalogMajor[] | null;
}

export type AdmissionCandidateReason =
  | "SAME_UNIVERSITY_CODE"
  | "SAME_UNIVERSITY_NAME";

export interface AdmissionGroupCandidate {
  sequenceNo: number;
  universityCode: string;
  universityName: string;
  groupCode: string;
  reasons: AdmissionCandidateReason[];
}

export type AdmissionMatchMethod =
  | "UNIVERSITY_CODE_AND_GROUP_CODE"
  | "UNIVERSITY_NAME_AND_GROUP_CODE"
  | "MAJOR_CODE"
  | "MAJOR_NAME"
  | "GROUP_ADJUSTMENT";

export interface AdmissionMatchResult {
  status: AdmissionMatchStatus;
  /** Original group sequence from the submitted form; never an array index. */
  sequenceNo: number | null;
  /** One-based index in the original submitted majors array. */
  majorSequenceNo: number | null;
  /** null means that adjustment has not been proven either way. */
  isAdjusted: boolean | null;
  matchedGroup: ParsedVolunteer | null;
  matchedMajor: ParsedMajor | null;
  candidates: AdmissionGroupCandidate[];
  methods: AdmissionMatchMethod[];
  warnings: string[];
}

interface NormalizedMajorMatch {
  major: ParsedMajor;
  index: number;
  method: "MAJOR_CODE" | "MAJOR_NAME";
  warnings: string[];
}

function resolvedMajorSequenceNo(
  majors: readonly ParsedMajor[],
  matchedIndex: number,
): number | null {
  const hasExplicitOrder = majors.some((major) => major.originalOrder != null);
  if (!hasExplicitOrder) {
    // Legacy/OCR payloads without slot metadata may have compressed a failed
    // earlier item. Only a complete six-slot list proves index preservation.
    return hasSixCompleteUniqueMajors(majors) ? matchedIndex + 1 : null;
  }

  const ordered = new Map<number, ParsedMajor>();
  for (const major of majors) {
    const order = major.originalOrder;
    if (
      !Number.isInteger(order) ||
      order == null ||
      order < 1 ||
      order > 6 ||
      ordered.has(order)
    ) {
      return null;
    }
    ordered.set(order, major);
  }
  const targetOrder = majors[matchedIndex]?.originalOrder;
  if (!targetOrder) return null;
  for (let order = 1; order < targetOrder; order += 1) {
    const earlier = ordered.get(order);
    if (
      !earlier ||
      !normalizeCode(earlier.code) ||
      !normalizeMajorName(earlier.name)
    ) {
      return null;
    }
  }
  return targetOrder;
}

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\[\]【】()（）]/g, "");
}

function normalizeNameBase(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^\[[0-9A-Z]+\]/i, "")
    .replace(/^【[0-9A-Z]+】/i, "")
    .replace(/\s+/g, "")
    .replace(/[（(]/g, "(")
    .replace(/[）)]/g, ")");
}

function normalizeUniversityName(value: string | null | undefined): string {
  return normalizeNameBase(value).replace(/[()[\]【】]/g, "");
}

function normalizeMajorNameStrict(value: string | null | undefined): string {
  return normalizeNameBase(value).replace(/[()[\]【】]/g, "");
}

function normalizeMajorName(value: string | null | undefined): string {
  return normalizeNameBase(value)
    .replace(/\((?:师范|师范类)\)$/g, "")
    .replace(/(?:师范|师范类)$/g, "")
    .replace(/[()[\]【】]/g, "");
}

function normalizeBatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[（()）]/g, "")
    .replace(/普通类|物理类|历史类/g, "")
    .replace(/批次/g, "批")
    .replace(/高职专科/g, "专科");
}

function batchesAreEquivalent(
  recognizedBatch: string | null | undefined,
  parsedBatch: string | null | undefined,
): boolean {
  const recognized = normalizeBatch(recognizedBatch);
  const parsed = normalizeBatch(parsedBatch);
  return Boolean(recognized && parsed && recognized === parsed);
}

function emptyResult(
  status: AdmissionMatchStatus,
  warnings: string[],
  candidates: AdmissionGroupCandidate[] = [],
): AdmissionMatchResult {
  return {
    status,
    sequenceNo: null,
    majorSequenceNo: null,
    isAdjusted: null,
    matchedGroup: null,
    matchedMajor: null,
    candidates,
    methods: [],
    warnings,
  };
}

function groupCandidates(
  recognized: RecognizedAdmission,
  volunteers: readonly ParsedVolunteer[],
): AdmissionGroupCandidate[] {
  const recognizedCode = normalizeCode(recognized.universityCode);
  const recognizedName = normalizeUniversityName(recognized.universityName);

  return volunteers
    .map((volunteer) => {
      const reasons: AdmissionCandidateReason[] = [];
      if (
        recognizedCode &&
        normalizeCode(volunteer.schoolCode) === recognizedCode
      ) {
        reasons.push("SAME_UNIVERSITY_CODE");
      }
      if (
        recognizedName &&
        normalizeUniversityName(volunteer.schoolName) === recognizedName
      ) {
        reasons.push("SAME_UNIVERSITY_NAME");
      }
      if (reasons.length === 0) return null;
      return {
        sequenceNo: volunteer.seq,
        universityCode: volunteer.schoolCode,
        universityName: volunteer.schoolName,
        groupCode: volunteer.groupCode,
        reasons,
      } satisfies AdmissionGroupCandidate;
    })
    .filter(
      (candidate): candidate is AdmissionGroupCandidate => candidate != null,
    )
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
}

function matchSelectedMajor(
  recognized: RecognizedAdmission,
  majors: readonly ParsedMajor[],
):
  | NormalizedMajorMatch
  | null
  | "AMBIGUOUS"
  | "CODE_NAME_CONFLICT"
  | "CODE_NOT_FOUND" {
  const recognizedCode = normalizeCode(recognized.majorCode);
  const recognizedName = normalizeMajorName(recognized.majorName);

  if (recognizedCode) {
    const codeMatches = majors
      .map((major, index) => ({ major, index }))
      .filter(({ major }) => normalizeCode(major.code) === recognizedCode);
    if (codeMatches.length > 1) return "AMBIGUOUS";
    if (codeMatches.length === 1) {
      const [{ major, index }] = codeMatches;
      const warnings: string[] = [];
      if (
        recognized.majorName &&
        major.name &&
        normalizeMajorName(recognized.majorName) !==
          normalizeMajorName(major.name)
      ) {
        return "CODE_NAME_CONFLICT";
      }
      if (
        recognized.majorName &&
        major.name &&
        normalizeMajorNameStrict(recognized.majorName) !==
          normalizeMajorNameStrict(major.name)
      ) {
        warnings.push(
          `专业代码一致，但录取专业名称“${recognized.majorName}”与志愿表“${major.name}”存在差异`,
        );
      }
      return { major, index, method: "MAJOR_CODE", warnings };
    }
  }

  if (recognizedName) {
    const nameMatches = majors
      .map((major, index) => ({ major, index }))
      .filter(({ major }) => normalizeMajorName(major.name) === recognizedName);
    if (nameMatches.length > 1) return "AMBIGUOUS";
    if (nameMatches.length === 1) {
      const [{ major, index }] = nameMatches;
      if (recognizedCode) return "CODE_NOT_FOUND";
      const warnings: string[] = [];
      return { major, index, method: "MAJOR_NAME", warnings };
    }
  }

  return null;
}

function catalogContainsAdmission(
  recognized: RecognizedAdmission,
  catalog: readonly AdmissionCatalogMajor[] | null | undefined,
): boolean {
  if (!Array.isArray(catalog)) return false;
  const recognizedCode = normalizeCode(recognized.majorCode);
  const recognizedName = normalizeMajorName(recognized.majorName);
  if (recognizedCode) {
    const codeMatches = catalog.filter(
      (major) => normalizeCode(major.code) === recognizedCode,
    );
    if (codeMatches.length !== 1) return false;
    const catalogName = normalizeMajorName(codeMatches[0].name);
    return (
      !recognizedName || Boolean(catalogName && recognizedName === catalogName)
    );
  }
  return Boolean(
    recognizedName &&
    catalog.some((major) => normalizeMajorName(major.name) === recognizedName),
  );
}

function hasSixCompleteUniqueMajors(majors: readonly ParsedMajor[]): boolean {
  if (majors.length !== 6) return false;
  const explicitOrders = majors.map((major) => major.originalOrder);
  if (
    explicitOrders.some((order) => order != null) &&
    (explicitOrders.some(
      (order) =>
        !Number.isInteger(order) || order == null || order < 1 || order > 6,
    ) ||
      new Set(explicitOrders).size !== 6)
  ) {
    return false;
  }
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const major of majors) {
    const code = normalizeCode(major.code);
    const name = normalizeMajorName(major.name);
    if (!code || !name || codes.has(code) || names.has(name)) return false;
    codes.add(code);
    names.add(name);
  }
  return true;
}

function catalogConfirmsAdjustment(
  recognized: RecognizedAdmission,
  selectedMajors: readonly ParsedMajor[],
  catalog: readonly AdmissionCatalogMajor[] | null | undefined,
): boolean {
  if (!Array.isArray(catalog) || !hasSixCompleteUniqueMajors(selectedMajors)) {
    return false;
  }

  const matchedCatalogIndexes = new Set<number>();
  for (const selected of selectedMajors) {
    const selectedCode = normalizeCode(selected.code);
    const selectedName = normalizeMajorName(selected.name);
    const matches = catalog
      .map((catalogMajor, index) => ({ catalogMajor, index }))
      .filter(
        ({ catalogMajor }) =>
          normalizeCode(catalogMajor.code) === selectedCode &&
          normalizeMajorName(catalogMajor.name) === selectedName,
      );
    if (matches.length !== 1 || matchedCatalogIndexes.has(matches[0].index)) {
      return false;
    }
    matchedCatalogIndexes.add(matches[0].index);
  }

  const recognizedCode = normalizeCode(recognized.majorCode);
  const recognizedName = normalizeMajorName(recognized.majorName);
  const admissionMatches = catalog
    .map((catalogMajor, index) => ({ catalogMajor, index }))
    .filter(({ catalogMajor }) => {
      if (recognizedCode) {
        return (
          normalizeCode(catalogMajor.code) === recognizedCode &&
          (!recognizedName ||
            normalizeMajorName(catalogMajor.name) === recognizedName)
        );
      }
      return (
        Boolean(recognizedName) &&
        normalizeMajorName(catalogMajor.name) === recognizedName
      );
    });

  return (
    admissionMatches.length === 1 &&
    !matchedCatalogIndexes.has(admissionMatches[0].index)
  );
}

/**
 * Match OCR output from an admission notice against the original, ordered
 * volunteer-form extraction. The function is deterministic and has no I/O.
 */
export function matchAdmissionToVolunteerForm(
  recognized: RecognizedAdmission,
  parsedForm: ParsedForm,
  options: AdmissionMatchOptions = {},
): AdmissionMatchResult {
  if (!batchesAreEquivalent(recognized.batchName, parsedForm.batch)) {
    return emptyResult(AdmissionMatchStatus.REVIEW_REQUIRED, [
      `录取批次“${recognized.batchName ?? ""}”与志愿表批次“${parsedForm.batch ?? ""}”无法确认属于同一段次`,
    ]);
  }

  const recognizedGroupCode = normalizeCode(recognized.groupCode);
  const recognizedUniversityCode = normalizeCode(recognized.universityCode);
  const recognizedUniversityName = normalizeUniversityName(
    recognized.universityName,
  );
  if (
    !recognizedGroupCode ||
    (!recognizedUniversityCode && !recognizedUniversityName)
  ) {
    return emptyResult(
      AdmissionMatchStatus.REVIEW_REQUIRED,
      ["录取信息缺少可用于锁定院校专业组的院校或专业组代码"],
      recognizedUniversityCode || recognizedUniversityName
        ? groupCandidates(recognized, parsedForm.volunteers)
        : [],
    );
  }

  const exactGroups = parsedForm.volunteers.filter((volunteer) => {
    if (normalizeCode(volunteer.groupCode) !== recognizedGroupCode) {
      return false;
    }
    if (recognizedUniversityCode) {
      return normalizeCode(volunteer.schoolCode) === recognizedUniversityCode;
    }
    return (
      normalizeUniversityName(volunteer.schoolName) === recognizedUniversityName
    );
  });

  if (exactGroups.length !== 1) {
    const candidates = groupCandidates(recognized, parsedForm.volunteers);
    if (exactGroups.length > 1) {
      return emptyResult(
        AdmissionMatchStatus.REVIEW_REQUIRED,
        ["志愿表中存在多个相同院校专业组，无法自动确定顺序"],
        candidates,
      );
    }
    return emptyResult(
      AdmissionMatchStatus.GROUP_NOT_FOUND,
      ["当前志愿表中没有精确匹配的院校专业组"],
      candidates,
    );
  }

  const group = exactGroups[0];
  if (
    recognizedUniversityCode &&
    recognizedUniversityName &&
    normalizeUniversityName(group.schoolName) &&
    normalizeUniversityName(group.schoolName) !== recognizedUniversityName
  ) {
    return emptyResult(AdmissionMatchStatus.REVIEW_REQUIRED, [
      "录取院校名称与志愿表中该院校代码对应的院校名称不一致，请人工复核",
    ]);
  }
  const groupMethod: AdmissionMatchMethod = recognizedUniversityCode
    ? "UNIVERSITY_CODE_AND_GROUP_CODE"
    : "UNIVERSITY_NAME_AND_GROUP_CODE";
  const selectedMajorMatch = matchSelectedMajor(recognized, group.majors);
  if (selectedMajorMatch === "AMBIGUOUS") {
    return {
      status: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: group.seq,
      majorSequenceNo: null,
      isAdjusted: null,
      matchedGroup: group,
      matchedMajor: null,
      candidates: [],
      methods: [groupMethod],
      warnings: ["组内有多个专业同时命中，需人工确认录取专业顺序"],
    };
  }
  if (
    selectedMajorMatch === "CODE_NAME_CONFLICT" ||
    selectedMajorMatch === "CODE_NOT_FOUND"
  ) {
    return {
      status: AdmissionMatchStatus.REVIEW_REQUIRED,
      sequenceNo: group.seq,
      majorSequenceNo: null,
      isAdjusted: null,
      matchedGroup: group,
      matchedMajor: null,
      candidates: [],
      methods: [
        groupMethod,
        selectedMajorMatch === "CODE_NAME_CONFLICT"
          ? "MAJOR_CODE"
          : "MAJOR_NAME",
      ],
      warnings: [
        selectedMajorMatch === "CODE_NAME_CONFLICT"
          ? "录取专业代码虽命中，但专业名称实质不一致，请人工确认"
          : "录取专业代码未命中，不能仅按专业名称自动锁定，请人工确认",
      ],
    };
  }

  if (selectedMajorMatch) {
    const majorSequenceNo = resolvedMajorSequenceNo(
      group.majors,
      selectedMajorMatch.index,
    );
    if (majorSequenceNo == null) {
      return {
        status: AdmissionMatchStatus.REVIEW_REQUIRED,
        sequenceNo: group.seq,
        majorSequenceNo: null,
        isAdjusted: null,
        matchedGroup: group,
        matchedMajor: selectedMajorMatch.major,
        candidates: [],
        methods: [groupMethod, selectedMajorMatch.method],
        warnings: [
          ...selectedMajorMatch.warnings,
          "录取专业之前存在未识别槽位或原始专业顺序不完整，请人工确认",
        ],
      };
    }
    return {
      status: AdmissionMatchStatus.EXACT,
      sequenceNo: group.seq,
      majorSequenceNo,
      isAdjusted: false,
      matchedGroup: group,
      matchedMajor: selectedMajorMatch.major,
      candidates: [],
      methods: [groupMethod, selectedMajorMatch.method],
      warnings: selectedMajorMatch.warnings,
    };
  }

  const hasCompleteSixMajors = hasSixCompleteUniqueMajors(group.majors);
  const catalogContainsMajor = catalogContainsAdmission(
    recognized,
    options.groupCatalogMajors,
  );
  const catalogConfirmsAllMajors = catalogConfirmsAdjustment(
    recognized,
    group.majors,
    options.groupCatalogMajors,
  );
  if (
    hasCompleteSixMajors &&
    group.acceptAdjust === true &&
    catalogContainsMajor &&
    catalogConfirmsAllMajors
  ) {
    return {
      status: AdmissionMatchStatus.ADJUSTED,
      sequenceNo: group.seq,
      majorSequenceNo: null,
      isAdjusted: true,
      matchedGroup: group,
      matchedMajor: null,
      candidates: [],
      methods: [groupMethod, "GROUP_ADJUSTMENT"],
      warnings: ["录取专业不在六个已填专业中，已判定为同专业组内调剂"],
    };
  }

  const warnings = ["院校专业组已命中，但录取专业未在已填专业中找到"];
  if (!hasCompleteSixMajors) {
    warnings.push("志愿表未完整识别出六个专业，不能据此判定调剂");
  }
  if (group.acceptAdjust !== true) {
    warnings.push("志愿表未明确服从专业调剂");
  }
  if (!catalogContainsMajor) {
    warnings.push("完整专业组目录未确认包含该录取专业");
  }
  if (catalogContainsMajor && !catalogConfirmsAllMajors) {
    warnings.push(
      "六个已填专业未能逐一与同组完整目录唯一对应，不能据此判定调剂",
    );
  }

  return {
    status: AdmissionMatchStatus.REVIEW_REQUIRED,
    sequenceNo: group.seq,
    majorSequenceNo: null,
    isAdjusted: null,
    matchedGroup: group,
    matchedMajor: null,
    candidates: [],
    methods: [groupMethod],
    warnings,
  };
}
