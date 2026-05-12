/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentDetailPage from '../page';

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

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      id: 1,
      realName: '测试学生',
      dataVersion: 1,
      status: 'ACTIVE',
      intakeStatus: 'DRAFT',
      examYear: 2026,
      examType: 'PHYSICS',
      totalScore: 600,
      provincialRank: 1,
      rankCheck: {
        calculatedRank: 28500,
        currentRank: 1,
        isMismatch: true,
        difference: -28499,
        source: 'score-segment',
      },
      progress: {
        studentSelfCompleteness: 80,
        teacherDataCompleteness: 70,
        overallCompleteness: 75,
        isRecommendable: true,
        missingFieldsForRecommend: [],
      },
    },
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

describe('StudentDetailPage', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it('shows concrete options for preference and bonus selects', async () => {
    const user = userEvent.setup();
    const { container } = render(<StudentDetailPage />);

    await openSelect(container, user, 'preferredProvinces');
    expect((await screen.findAllByText('四川省')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredCities');
    expect((await screen.findAllByText('成都市')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredUniversities');
    expect((await screen.findAllByText('四川大学')).length).toBeGreaterThan(0);

    await openSelect(container, user, 'preferredMajors');
    expect((await screen.findAllByText('计算机科学与技术')).length).toBeGreaterThan(0);

    await user.click(screen.getByText('加分政策'));
    await openSelect(container, user, 'bonusItems');
    expect((await screen.findAllByText('烈士子女 +20')).length).toBeGreaterThan(0);
  });
  it('marks provincial rank mismatch against the score-segment calculation', () => {
    render(<StudentDetailPage />);

    expect(
      screen.getByText((text) => text.includes('28,500') && text.includes('1')),
    ).toBeInTheDocument();
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
