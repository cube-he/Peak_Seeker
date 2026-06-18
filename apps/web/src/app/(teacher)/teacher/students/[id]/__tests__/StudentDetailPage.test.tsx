/** @jest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentDetailPage from '../page';

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockBaseStudentData = {
  id: 1,
  realName: '测试学生',
  dataVersion: 1,
  status: 'ACTIVE',
  intakeStatus: 'DRAFT',
  examYear: 2026,
  examType: 'PHYSICS',
  province: '四川',
  city: '成都市',
  county: '锦江区',
  examLocationProvince: null,
  examLocationCity: null,
  examLocationCounty: null,
  totalScore: 600,
  provincialRank: 1,
  rankCheck: {
    calculatedRank: 28500,
    currentRank: 1,
    isMismatch: true,
    difference: -28499,
    requestedYear: 2026,
    sourceYear: 2026,
    isEstimated: false,
    source: 'score-segment',
  },
  progress: {
    studentSelfCompleteness: 80,
    teacherDataCompleteness: 70,
    overallCompleteness: 75,
    isRecommendable: true,
    missingFieldsForRecommend: [],
  },
};
let mockStudentData = mockBaseStudentData;

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

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockStudentData,
    isLoading: false,
  }),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/components/policy/BonusCalcCard', () => ({
  __esModule: true,
  default: function MockBonusCalcCard() {
    return <div>加分测算</div>;
  },
}));

jest.mock('@/components/student/picker/options/useProvinceOptions', () => ({
  useProvinceOptions: () => ({
    data: [{ label: '四川省', value: '四川省' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useCityOptions', () => ({
  useCityOptions: () => ({
    data: [{ label: '成都市', value: '成都市' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useUniversityOptions', () => ({
  useUniversityOptions: () => ({
    data: [{ label: '四川大学', value: '四川大学' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useMajorOptions', () => ({
  useMajorOptions: () => ({
    data: [{ label: '计算机科学与技术', value: '计算机科学与技术' }],
    isLoading: false,
  }),
}));

jest.mock('@/components/student/picker/options/useMajorCategoryOptions', () => ({
  useMajorCategoryOptions: () => ({
    data: [{ label: '计算机类', value: '计算机类' }],
    isLoading: false,
  }),
}));

// sd-subtabs: 子表单只在对应子页激活时渲染, 点子 tab 按钮切换
async function gotoSubtab(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  // 缺失项 mchip 也是 role=button (如 bonusStatus 标签"加分政策" 与子 tab 同名), 精确取 .sd-subtab
  const subtab = screen
    .getAllByRole('button', { name })
    .find((b) => b.classList.contains('sd-subtab'));
  if (!subtab) throw new Error(`sd-subtab not found: ${name.source}`);
  await user.click(subtab);
}

describe('StudentDetailPage', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidateQueries.mockClear();
    mockStudentData = {
      ...mockBaseStudentData,
      rankCheck: { ...mockBaseStudentData.rankCheck },
      progress: { ...mockBaseStudentData.progress },
    };
  });

  // 该 jest 配置未启用 RTL 自动清理, 显式卸载避免跨测试 DOM 累积导致多元素匹配
  afterEach(() => cleanup());

  it('shows concrete options for preference and bonus selects', async () => {
    const user = userEvent.setup();
    const { container } = render(<StudentDetailPage />);

    await gotoSubtab(user, /偏好与规划/);

    await openSelect(container, user, 'preferredProvinces');
    expect((await screen.findAllByText('四川省')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredCities');
    expect((await screen.findAllByText('成都市')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredUniversities');
    expect((await screen.findAllByText('四川大学')).length).toBeGreaterThan(0);

    await gotoSubtab(user, /加分政策/);
    await openSelect(container, user, 'bonusItems');
    expect((await screen.findAllByText('烈士子女 +20')).length).toBeGreaterThan(0);
  });

  it('marks provincial rank mismatch against the score-segment calculation', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    await gotoSubtab(user, /考试成绩/);

    expect(
      screen.getByText((text) => text.includes('28,500') && text.includes('1')),
    ).toBeInTheDocument();
  });

  it('labels temporary 2025 score segment data used for 2026 rank checks', async () => {
    mockStudentData = {
      ...mockBaseStudentData,
      totalScore: 479,
      rankCheck: {
        calculatedRank: 156000,
        currentRank: 1,
        isMismatch: true,
        difference: -155999,
        requestedYear: 2026,
        sourceYear: 2025,
        isEstimated: true,
        source: 'score-segment',
      },
    };

    const user = userEvent.setup();
    render(<StudentDetailPage />);

    await gotoSubtab(user, /考试成绩/);

    expect(
      screen.getByText((text) => text.includes('按 2025 一分一段估算') && text.includes('156,000')),
    ).toBeInTheDocument();
  });

  it('uses region cascaders and can copy hukou location to exam registration location', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    await gotoSubtab(user, /户籍信息/);

    // 户籍/报名地字段标签都在 (sd-subtabs 户籍子页已渲染)
    expect(screen.getAllByText('户籍所在地').length).toBeGreaterThan(0);
    expect(screen.getAllByText('高考报名地').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /同户籍所在地/ }));
    await user.click(screen.getByRole('button', { name: /保存资料/ }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          province: '四川',
          city: '成都市',
          county: '锦江区',
          examLocationProvince: '四川',
          examLocationCity: '成都市',
          examLocationCounty: '锦江区',
        }),
      );
    });
  });

  // 整档保存: 在 A 子页编辑后切到 B 子页保存, A 的编辑也要进 payload (而非只存当前 B 子页)
  it('保存时提交所有访问过子页的编辑, 而非只当前子页', async () => {
    const user = userEvent.setup();
    render(<StudentDetailPage />);

    // 在「户籍信息」子页做一处编辑: 把户籍地复制到高考报名地
    await gotoSubtab(user, /户籍信息/);
    await user.click(screen.getByRole('button', { name: /同户籍所在地/ }));

    // 切到「偏好与规划」子页 (户籍子页随之卸载), 在这里点保存
    await gotoSubtab(user, /偏好与规划/);
    await user.click(screen.getByRole('button', { name: /保存资料/ }));

    // 户籍子页那处编辑必须一并提交 (旧逻辑只收当前挂载子页 → 会漏掉)
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          examLocationProvince: '四川',
          examLocationCity: '成都市',
          examLocationCounty: '锦江区',
        }),
      );
    });
  });
});

async function openSelect(
  container: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  id: string,
) {
  const selector = container.querySelector(`#${id}`);
  expect(selector).toBeTruthy();
  await user.click(selector as HTMLElement);
  await waitFor(() => {
    expect(document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeTruthy();
  });
}
