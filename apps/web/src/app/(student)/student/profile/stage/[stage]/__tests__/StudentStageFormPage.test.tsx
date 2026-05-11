/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import StudentStageFormPage from '../page';

let mockStage = '2';
const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockMutate = jest.fn();

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

jest.mock('next/navigation', () => ({
  useParams: () => ({ stage: mockStage }),
  usePathname: () => `/student/profile/stage/${mockStage}`,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      realName: '陈意涵',
      username: 'student01',
      highSchool: '成都七中',
      classInfo: '高三 3 班',
      totalScore: 644,
      provincialRank: 8240,
      dataVersion: 3,
      progress: {
        overallCompleteness: 72,
        isRecommendable: false,
        stageProgress: {
          stage1: { filled: 6, total: 8, completed: false },
          stage2: { filled: 9, total: 15, completed: false },
          stage3: { filled: 5, total: 24, completed: false },
        },
      },
    },
    isLoading: false,
  }),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/services/student-api', () => ({
  studentApi: {
    getMyProfile: jest.fn(),
    updateMyProfile: jest.fn(),
  },
}));

describe('StudentStageFormPage', () => {
  beforeEach(() => {
    mockStage = '2';
    mockPush.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutate.mockClear();
  });

  it('renders the active stage inside a three-stage editing workbench', () => {
    render(<StudentStageFormPage />);

    expect(
      screen.getByRole('heading', { name: '档案编辑工作台' }),
    ).toBeInTheDocument();
    expect(screen.getByText('核心信息').closest('a')).toHaveAttribute(
      'href',
      '/student/profile/stage/1',
    );
    expect(screen.getAllByText('完善信息')[0].closest('a')).toHaveAttribute(
      'href',
      '/student/profile/stage/2',
    );
    expect(screen.getByText('高级信息').closest('a')).toHaveAttribute(
      'href',
      '/student/profile/stage/3',
    );
    expect(screen.getAllByText('阶段 2：完善信息').length).toBeGreaterThan(0);
    expect(screen.getByText('保存当前阶段').closest('button')).toBeInTheDocument();
  });
});
