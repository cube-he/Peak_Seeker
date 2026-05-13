const mockPut = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: mockPut,
    delete: jest.fn(),
  },
}));

import { studentApi } from '../student-api';

describe('studentApi', () => {
  beforeEach(() => {
    mockPut.mockClear();
  });

  it('updates teacher-managed student profiles through the backend profile route', () => {
    studentApi.update('1', { totalScore: 479 });

    expect(mockPut).toHaveBeenCalledWith('/students/1/profile', { totalScore: 479 });
  });
});
