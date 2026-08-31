const mockPut = jest.fn();
const mockPost = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: mockPost,
    put: mockPut,
    delete: jest.fn(),
  },
}));

import { studentApi } from '../student-api';

describe('studentApi', () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockPost.mockClear();
  });

  it('updates teacher-managed student profiles through the backend profile route', () => {
    studentApi.update('1', { totalScore: 479 });

    expect(mockPut).toHaveBeenCalledWith('/students/1/profile', { totalScore: 479 });
  });

  it('analyzes a proof against the selected volunteer-form attachment', () => {
    studentApi.analyzeAdmissionResult(1, {
      proofAttachmentId: 21,
      submissionAttachmentId: 11,
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/students/1/admission-result/analyze',
      {
        proofAttachmentId: 21,
        submissionAttachmentId: 11,
      },
      { timeout: 280_000 },
    );
  });
});
