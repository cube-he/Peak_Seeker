import type {
  AdmissionAnalysisResponse,
  AdmissionResultMatchStatus,
  SaveAdmissionResultDto,
  StudentAttachment,
} from '@/services/student-api';

export type AdmissionDraftField = keyof SaveAdmissionResultDto;

type SubmissionAttachment = Pick<
  StudentAttachment,
  'id' | 'category' | 'originalName' | 'mimeType' | 'createdAt'
>;

/**
 * Fields owned by the latest OCR/match draft. A new proof or volunteer-form
 * analysis may replace these fields, but never fields edited by the teacher in
 * the current form session.
 */
export const ADMISSION_ANALYSIS_FIELDS: readonly AdmissionDraftField[] = [
  'batchName',
  'admittedUniName',
  'admittedUniId',
  'admittedUniCode',
  'admittedMajorGroupCode',
  'admittedMajorCode',
  'admittedMajorName',
  'admittedMajorId',
  'sequenceNo',
  'majorSequenceNo',
  'isAdjusted',
];

const ADMISSION_MATCH_POSITION_RESET_VALUES: Partial<
  Record<AdmissionDraftField, unknown>
> = {
  sequenceNo: undefined,
  majorSequenceNo: undefined,
  isAdjusted: false,
};

function normalizeRecognizedText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function isSubmissionPdfAttachment(attachment: SubmissionAttachment) {
  return (
    attachment.category === 'submission_screenshot' &&
    (attachment.mimeType?.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(attachment.originalName))
  );
}

export function getDefaultAdmissionSubmissionAttachmentId(
  attachments: readonly SubmissionAttachment[],
  sourceAttachmentIds: ReadonlyArray<number | null | undefined>,
) {
  const pdfAttachments = attachments.filter(isSubmissionPdfAttachment);
  const availableIds = new Set(pdfAttachments.map((attachment) => attachment.id));
  const existingSourceId = sourceAttachmentIds.find(
    (sourceAttachmentId): sourceAttachmentId is number =>
      sourceAttachmentId != null && availableIds.has(sourceAttachmentId),
  );
  if (existingSourceId != null) {
    return existingSourceId;
  }

  return [...pdfAttachments].sort((left, right) => {
    const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return Number.isFinite(timeDifference) && timeDifference !== 0
      ? timeDifference
      : right.id - left.id;
  })[0]?.id;
}

export function buildAdmissionAnalysisPatch(
  analysis: AdmissionAnalysisResponse,
): Partial<SaveAdmissionResultDto> {
  const canUseGroupPosition =
    analysis.matchStatus === 'EXACT' || analysis.matchStatus === 'ADJUSTED';
  const canUseMajorPosition = analysis.matchStatus === 'EXACT';

  return {
    batchName: normalizeRecognizedText(analysis.recognized.batchName),
    admittedUniName: normalizeRecognizedText(analysis.recognized.admittedUniName),
    admittedUniId: analysis.admissionResult?.admittedUniId ?? undefined,
    admittedUniCode: normalizeRecognizedText(analysis.recognized.admittedUniCode),
    admittedMajorGroupCode: normalizeRecognizedText(analysis.recognized.admittedMajorGroupCode),
    admittedMajorCode: normalizeRecognizedText(analysis.recognized.admittedMajorCode),
    admittedMajorName: normalizeRecognizedText(analysis.recognized.admittedMajorName),
    admittedMajorId: analysis.admissionResult?.admittedMajorId ?? undefined,
    sequenceNo: canUseGroupPosition ? (analysis.matched.sequenceNo ?? undefined) : undefined,
    majorSequenceNo: canUseMajorPosition
      ? (analysis.matched.majorSequenceNo ?? undefined)
      : undefined,
    isAdjusted: analysis.matchStatus === 'ADJUSTED',
  };
}

export function getAdmissionAnalysisFieldUpdates(
  analysis: AdmissionAnalysisResponse,
  manuallyEditedFields: ReadonlySet<AdmissionDraftField>,
): Array<{ field: AdmissionDraftField; value: unknown }> {
  const patch = buildAdmissionAnalysisPatch(analysis);

  return ADMISSION_ANALYSIS_FIELDS.filter((field) => !manuallyEditedFields.has(field)).map(
    (field) => ({ field, value: patch[field] }),
  );
}

export function getAdmissionAnalysisFieldsToClear(
  manuallyEditedFields: ReadonlySet<AdmissionDraftField>,
): AdmissionDraftField[] {
  return ADMISSION_ANALYSIS_FIELDS.filter((field) => !manuallyEditedFields.has(field));
}

export function getAdmissionIdentityResetUpdates(): Array<{
  field: AdmissionDraftField;
  value: unknown;
}> {
  return ADMISSION_ANALYSIS_FIELDS.map((field) => ({
    field,
    value: field === 'isAdjusted' ? false : undefined,
  }));
}

export function getAdmissionMatchPositionResetUpdates(
  manuallyEditedFields: ReadonlySet<AdmissionDraftField>,
): Array<{ field: AdmissionDraftField; value: unknown }> {
  return (Object.keys(ADMISSION_MATCH_POSITION_RESET_VALUES) as AdmissionDraftField[])
    .filter((field) => !manuallyEditedFields.has(field))
    .map((field) => ({
      field,
      value: ADMISSION_MATCH_POSITION_RESET_VALUES[field],
    }));
}

export function isAdmissionSubmissionSourceAttachment(
  attachmentId: number,
  sourceAttachmentIds: ReadonlyArray<number | null | undefined>,
) {
  return sourceAttachmentIds.some((sourceAttachmentId) => sourceAttachmentId === attachmentId);
}

export function shouldInvalidateAdmissionSubmissionMatch(
  attachmentId: number,
  sourceAttachmentIds: ReadonlyArray<number | null | undefined>,
  options: {
    isSubmissionAttachment: boolean;
    isDefaultSourceAnalysisInFlight: boolean;
  },
) {
  return (
    isAdmissionSubmissionSourceAttachment(attachmentId, sourceAttachmentIds) ||
    (options.isSubmissionAttachment && options.isDefaultSourceAnalysisInFlight)
  );
}

export function isCurrentAdmissionAnalysis(
  requestId: number,
  latestRequestId: number,
  responseProofAttachmentId: number,
  selectedProofAttachmentId: number | null | undefined,
) {
  return requestId === latestRequestId && responseProofAttachmentId === selectedProofAttachmentId;
}

export function getAdmissionMatchTitle(
  status: AdmissionResultMatchStatus,
  sequenceNo?: number | null,
  majorSequenceNo?: number | null,
) {
  switch (status) {
    case 'EXACT':
      return sequenceNo != null && majorSequenceNo != null
        ? `精确匹配：第 ${sequenceNo} 个志愿，第 ${majorSequenceNo} 个专业`
        : '录取结果已精确匹配';
    case 'ADJUSTED':
      return sequenceNo != null ? `组内专业调剂：第 ${sequenceNo} 个志愿` : '已识别为组内专业调剂';
    case 'REVIEW_REQUIRED':
      return '识别到疑似结果，请人工核对';
    case 'GROUP_NOT_FOUND':
      return '未在志愿 PDF 中匹配到院校专业组';
    case 'FORM_NOT_FOUND':
      return '未找到可用的志愿填报 PDF';
    case 'PARSE_FAILED':
      return '志愿填报 PDF 解析失败';
    case 'MANUAL_CONFIRMED':
      return '录取结果已人工确认';
  }
}
