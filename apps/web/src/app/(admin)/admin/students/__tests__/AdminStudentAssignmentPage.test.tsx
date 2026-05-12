/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import AdminStudentAssignmentPage from '../page';

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: () => ({
    getPropertyValue: () => '',
  }),
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: (config: { queryKey: unknown[] }) => {
    if (config.queryKey[0] === 'admin-student-assignments') {
      return {
        data: {
          data: [
            {
              id: 12,
              teacherId: null,
              highSchool: '成都七中',
              city: '成都',
              createdAt: '2026-05-01T00:00:00.000Z',
              user: {
                id: 88,
                username: 'student_li',
                realName: '李白',
                phone: '13800000000',
              },
            },
          ],
          total: 1,
        },
        isLoading: false,
      };
    }

    return {
      data: [
        {
          id: 10,
          school: 'Test School',
          user: {
            id: 21,
            username: 'test_he',
            realName: 'test_he',
          },
          _count: { students: 0 },
        },
      ],
      isLoading: false,
    };
  },
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/services/admin-api', () => ({
  adminApi: {
    getStudents: jest.fn(),
    getTeachers: jest.fn(),
    assignStudentTeacher: jest.fn(),
  },
}));

describe('AdminStudentAssignmentPage', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it('shows unassigned students and teacher assignment controls', () => {
    render(<AdminStudentAssignmentPage />);

    expect(screen.getByRole('heading', { name: '学生归属' })).toBeInTheDocument();
    expect(screen.getByText('李白')).toBeInTheDocument();
    expect(screen.getByText('student_li')).toBeInTheDocument();
    expect(screen.getAllByText('未分配').length).toBeGreaterThan(0);
    expect(screen.getByText('选择老师')).toBeInTheDocument();
  });
});
