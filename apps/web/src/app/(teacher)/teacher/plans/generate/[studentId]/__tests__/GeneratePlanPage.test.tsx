/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import GeneratePlanPage from '../page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockInvalidateQueries = jest.fn();

const mockMajor = {
  enrollmentPlanId: 1001,
  majorId: 201,
  majorName: 'Computer Science',
  suggestedGradient: 'WEN',
  matchStatus: 'PASS',
  failReasons: [],
  planCount: 20,
  planNotes: '色弱、色盲考生不录取；英语单科 ≥ 110',
};

const mockCandidateGroup = {
  groupKey: '1|101|本科批|普通类|物理',
  universityId: 1,
  universityName: 'Alpha University',
  universityCode: 'ALPHA',
  universityRank: 12,
  university: {
    id: 1,
    name: 'Alpha University',
    code: 'ALPHA',
    province: 'Sichuan',
    city: 'Chengdu',
    is985: true,
    is211: true,
    isDoubleFirstClass: true,
    softRanking: 12,
    logoUrl: '/logos/alpha.png',
  },
  groupCode: '101',
  groupName: 'Physics',
  batch: '本科批',
  recruitType: '普通类',
  subjects: '物理',
  currentPlanYear: 2026,
  previousPlanYear: 2025,
  currentPlanCount: 20,
  previousPlanCount: 18,
  planCountChange: 2,
  groupMinScore: 620,
  groupMinRank: 9000,
  scoreSource: 'GROUP',
  suggestedGradient: 'WEN',
  majorCount: 1,
  selectableMajorCount: 1,
  softFailCount: 0,
  matchScore: 87,
  matchReason: '本省·985·位次安全',
  history3y: [
    { year: 2023, score: 619, rank: 14200 },
    { year: 2024, score: 622, rank: 12800 },
    { year: 2025, score: 624, rank: 12034 },
  ],
  historyFiling3y: [
    { year: 2023, score: 624, rank: 13100 },
    { year: 2024, score: 627, rank: 11800 },
    { year: 2025, score: 629, rank: 11200 },
  ],
  majors: [mockMajor],
  majorSections: {
    recommended: [mockMajor],
    backup: [],
    risk: [],
  },
};

const mockStudent = {
  id: 1,
  realName: 'Test Student',
  intakeStatus: 'VERIFIED',
  totalScore: 650,
  provincialRank: 8000,
  examSource: 'PHYSICS',
  user: { realName: 'Test Student' },
};

const mockPlan = {
  id: 101,
  batchName: '本科批',
  status: 'DRAFT',
  versionNo: 1,
  planItems: [],
};

jest.mock('../candidate-pool-polished.module.css', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_target, prop) => String(prop) }),
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ studentId: '1' }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => new URLSearchParams('planId=101'),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((options: { queryKey?: unknown[] }) => {
    const key = options.queryKey?.[0];
    if (key === 'student-detail') return { data: mockStudent, isLoading: false, isFetching: false };
    if (key === 'eligible-batches') return { data: [], isLoading: false, isFetching: false };
    if (key === 'student-plans-latest') return { data: [], isLoading: false, isFetching: false };
    if (key === 'plan-detail') return { data: mockPlan, isLoading: false, isFetching: false };
    if (key === 'plan-candidate-groups') {
      return {
        data: {
          total: 1,
          planYear: 2026,
          sourceYear: 2026,
          previousYear: 2025,
          studentRankUsed: 8000,
          groups: [mockCandidateGroup],
        },
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  }),
  useMutation: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

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

describe('GeneratePlanPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the candidate university logo when the API returns one', async () => {
    render(<GeneratePlanPage />);

    const logo = await screen.findByRole('img', { name: 'Alpha University' });

    expect(logo).toHaveAttribute('src', '/logos/alpha.png');
  });

  it('renders MatchHeader with matchScore and matchReason', async () => {
    render(<GeneratePlanPage />);

    expect(await screen.findByText('匹配度')).toBeInTheDocument();
    expect(await screen.findByText('87')).toBeInTheDocument();
    expect(await screen.findByText('本省·985·位次安全')).toBeInTheDocument();
  });

  it('renders 3-year trend chart with default 投档线 toggle', async () => {
    render(<GeneratePlanPage />);

    // 趋势条 label
    expect(await screen.findByText(/近 3 年投档线/)).toBeInTheDocument();
    // 切换按钮
    expect(await screen.findByText('投档线趋势')).toBeInTheDocument();
    expect(await screen.findByText('组最低趋势')).toBeInTheDocument();
  });

  it('renders NotesChip next to major name when planNotes present', async () => {
    render(<GeneratePlanPage />);

    // NotesChip 取首句作为摘要（≤14 字截断），"色弱、色盲考生不录取" 是 10 字
    expect(await screen.findByText('色弱、色盲考生不录取')).toBeInTheDocument();
    // 多句备注末尾显示 +N
    expect(await screen.findByText('+1')).toBeInTheDocument();
  });
});
