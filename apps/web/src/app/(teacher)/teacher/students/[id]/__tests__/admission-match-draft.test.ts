import type { AdmissionAnalysisResponse } from '@/services/student-api';
import {
  buildAdmissionAnalysisPatch,
  getDefaultAdmissionSubmissionAttachmentId,
  getAdmissionIdentityResetUpdates,
  getAdmissionAnalysisFieldUpdates,
  getAdmissionAnalysisFieldsToClear,
  getAdmissionMatchPositionResetUpdates,
  getAdmissionMatchTitle,
  isAdmissionSubmissionSourceAttachment,
  isCurrentAdmissionAnalysis,
  isSubmissionPdfAttachment,
  shouldInvalidateAdmissionSubmissionMatch,
} from '../admission-match-draft';

const submissionAttachment = (
  id: number,
  originalName: string,
  createdAt: string,
  mimeType: string | null = 'application/pdf',
) => ({
  id,
  category: 'submission_screenshot' as const,
  originalName,
  mimeType,
  createdAt,
});

function analysis(overrides: Partial<AdmissionAnalysisResponse> = {}): AdmissionAnalysisResponse {
  return {
    proofAttachmentId: 21,
    submissionAttachmentId: 11,
    submissionAttachmentName: '志愿填报表.pdf',
    matchStatus: 'EXACT',
    message: '匹配成功',
    confidence: 0.98,
    recognized: {
      batchName: '本科批次B段',
      admittedUniName: '西华师范大学',
      admittedUniCode: '5122',
      admittedMajorGroupCode: '105',
      admittedMajorCode: '32',
      admittedMajorName: '数学与应用数学',
    },
    matched: {
      sequenceNo: 18,
      majorSequenceNo: 1,
      isAdjusted: false,
    },
    candidates: [],
    warnings: [],
    admissionResult: null,
    ...overrides,
  };
}

describe('buildAdmissionAnalysisPatch', () => {
  it('fills both group and major positions for an exact match', () => {
    expect(buildAdmissionAnalysisPatch(analysis())).toMatchObject({
      admittedUniName: '西华师范大学',
      admittedUniCode: '5122',
      admittedMajorGroupCode: '105',
      admittedMajorCode: '32',
      sequenceNo: 18,
      majorSequenceNo: 1,
      isAdjusted: false,
    });
  });

  it('keeps the group position but never invents a major position for adjustment', () => {
    const patch = buildAdmissionAnalysisPatch(
      analysis({
        matchStatus: 'ADJUSTED',
        matched: {
          sequenceNo: 18,
          majorSequenceNo: 4,
          isAdjusted: true,
        },
      }),
    );

    expect(patch.sequenceNo).toBe(18);
    expect(patch.majorSequenceNo).toBeUndefined();
    expect(patch.isAdjusted).toBe(true);
  });

  it.each(['REVIEW_REQUIRED', 'GROUP_NOT_FOUND', 'FORM_NOT_FOUND', 'PARSE_FAILED'] as const)(
    'does not fill a position for %s',
    (matchStatus) => {
      const patch = buildAdmissionAnalysisPatch(
        analysis({
          matchStatus,
          matched: {
            sequenceNo: 18,
            majorSequenceNo: 1,
            isAdjusted: true,
          },
        }),
      );

      expect(patch.sequenceNo).toBeUndefined();
      expect(patch.majorSequenceNo).toBeUndefined();
      expect(patch.isAdjusted).toBe(false);
    },
  );
});

describe('admission analysis field ownership', () => {
  it('does not overwrite fields edited by the teacher', () => {
    const updates = getAdmissionAnalysisFieldUpdates(
      analysis(),
      new Set(['admittedUniName', 'sequenceNo']),
    );

    expect(updates.map((item) => item.field)).not.toContain('admittedUniName');
    expect(updates.map((item) => item.field)).not.toContain('sequenceNo');
    expect(updates).toContainEqual({
      field: 'admittedMajorName',
      value: '数学与应用数学',
    });
  });

  it('clears only machine-owned fields before a new analysis', () => {
    const fields = getAdmissionAnalysisFieldsToClear(new Set(['batchName', 'admittedMajorName']));

    expect(fields).not.toContain('batchName');
    expect(fields).not.toContain('admittedMajorName');
    expect(fields).toContain('sequenceNo');
    expect(fields).toContain('majorSequenceNo');
  });

  it('resets only non-manual match positions when the source PDF is deleted', () => {
    expect(
      getAdmissionMatchPositionResetUpdates(new Set(['sequenceNo'])),
    ).toEqual([
      { field: 'majorSequenceNo', value: undefined },
      { field: 'isAdjusted', value: false },
    ]);
  });

  it('resets every proof-bound identity field without touching score fields', () => {
    const updates = getAdmissionIdentityResetUpdates();
    const fields = updates.map((item) => item.field);

    expect(fields).toEqual(expect.arrayContaining([
      'admittedUniName',
      'admittedUniCode',
      'admittedMajorGroupCode',
      'admittedMajorName',
      'sequenceNo',
      'majorSequenceNo',
      'isAdjusted',
    ]));
    expect(fields).not.toContain('admittedMinScore');
    expect(fields).not.toContain('admittedMinRank');
    expect(updates).toContainEqual({ field: 'isAdjusted', value: false });
  });
});

describe('submission source invalidation', () => {
  it('recognizes local, persisted, and in-flight source attachment ids', () => {
    expect(isAdmissionSubmissionSourceAttachment(11, [11, null, undefined])).toBe(true);
    expect(isAdmissionSubmissionSourceAttachment(12, [11, 12, undefined])).toBe(true);
    expect(isAdmissionSubmissionSourceAttachment(13, [11, 12, 13])).toBe(true);
    expect(isAdmissionSubmissionSourceAttachment(14, [11, 12, 13])).toBe(false);
  });

  it('invalidates an unpinned in-flight analysis when a volunteer PDF is deleted', () => {
    expect(
      shouldInvalidateAdmissionSubmissionMatch(14, [11, 12], {
        isSubmissionAttachment: true,
        isDefaultSourceAnalysisInFlight: true,
      }),
    ).toBe(true);
    expect(
      shouldInvalidateAdmissionSubmissionMatch(14, [11, 12], {
        isSubmissionAttachment: false,
        isDefaultSourceAnalysisInFlight: true,
      }),
    ).toBe(false);
  });
});

describe('volunteer PDF selection', () => {
  const attachments = [
    submissionAttachment(11, '旧志愿.pdf', '2026-06-01T00:00:00.000Z'),
    submissionAttachment(12, '填报截图.jpg', '2026-06-03T00:00:00.000Z', 'image/jpeg'),
    submissionAttachment(13, '新志愿.PDF', '2026-06-02T00:00:00.000Z', null),
  ];

  it('only treats submission PDF files as selectable sources', () => {
    expect(attachments.filter(isSubmissionPdfAttachment).map((item) => item.id)).toEqual([11, 13]);
  });

  it('prefers analysis then persisted sources, otherwise the latest PDF', () => {
    expect(getDefaultAdmissionSubmissionAttachmentId(attachments, [11, 13])).toBe(11);
    expect(getDefaultAdmissionSubmissionAttachmentId(attachments, [99, 13])).toBe(13);
    expect(getDefaultAdmissionSubmissionAttachmentId(attachments, [99, null])).toBe(13);
  });
});

describe('analysis request ordering', () => {
  it('accepts only the latest request for the currently selected proof', () => {
    expect(isCurrentAdmissionAnalysis(2, 2, 21, 21)).toBe(true);
    expect(isCurrentAdmissionAnalysis(1, 2, 21, 21)).toBe(false);
    expect(isCurrentAdmissionAnalysis(2, 2, 20, 21)).toBe(false);
  });
});

describe('getAdmissionMatchTitle', () => {
  it('describes exact and adjusted matches without inventing an adjusted major order', () => {
    expect(getAdmissionMatchTitle('EXACT', 18, 1)).toBe('精确匹配：第 18 个志愿，第 1 个专业');
    expect(getAdmissionMatchTitle('ADJUSTED', 18, null)).toBe('组内专业调剂：第 18 个志愿');
    expect(getAdmissionMatchTitle('MANUAL_CONFIRMED')).toBe('录取结果已人工确认');
  });
});
