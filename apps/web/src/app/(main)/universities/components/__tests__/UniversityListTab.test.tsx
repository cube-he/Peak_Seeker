/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UniversityListTab } from '../UniversityListTab';
import { universityService } from '@/services/university';
import { useStudentRank } from '@/stores/studentRankStore';

// antd Pagination/Grid 使用 matchMedia，jsdom 默认没有该 API
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
  })),
});

jest.mock('@/services/university');
jest.mock('@/components/university/UniversityLogo', () => ({
  __esModule: true,
  default: () => null,
}));

const mockedService = universityService as jest.Mocked<typeof universityService>;

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UniversityListTab />
    </QueryClientProvider>,
  );
}

describe('UniversityListTab header', () => {
  beforeEach(() => {
    mockedService.getList.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 12, total: 1893, totalPages: 158 },
    });
    mockedService.getHot.mockResolvedValue([]);
    mockedService.getFilters.mockResolvedValue({
      provinces: [], types: [], cities: [], levels: [], grades: [], natures: [],
    });
  });

  afterEach(() => {
    useStudentRank.setState({ rank: null, examType: '物理' });
  });

  it('shows a rank-tier badge on the card when the student rank is set', async () => {
    // 985 校 stable 阈值 1500；userRank 12000、predictedMinRank 11000 → diff -1000 → 稳
    useStudentRank.setState({ rank: 12000, examType: '物理' });
    mockedService.getList.mockResolvedValue({
      data: [{
        id: 7, name: '测试大学', code: null, province: '四川', city: '成都',
        type: '综合', level: '本科', runningNature: '公办',
        is985: true, is211: true, isDoubleFirstClass: true, ranking: null, logoUrl: null,
        latestAdmission: { minScore: 640, minRank: 11800 },
        predictedMinRank: 11000,
      }],
      pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    });
    renderTab();
    expect(await screen.findByText('稳')).toBeInTheDocument();
  });

  it('shows the real total from the API, not a hardcoded number', async () => {
    renderTab();
    // 等待 h1 内容反映接口返回的 total（接口异步返回前 total=0，之后更新）
    const heading = screen.getByRole('heading', { level: 1 });
    await waitFor(() => {
      expect(heading).toHaveTextContent(/1,?893/);
      expect(heading).not.toHaveTextContent(/2,237/);
    });
  });

  it('renders 物理/历史 exam-type toggle', async () => {
    renderTab();
    expect(await screen.findByRole('button', { name: '物理类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史类' })).toBeInTheDocument();
  });

  it('enables rank/tier sorting and shows the tier filter when a rank is set', async () => {
    useStudentRank.setState({ rank: 12000, examType: '物理' });
    renderTab();
    expect(await screen.findByRole('button', { name: /位次/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: '冲稳保' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '冲' })).toBeInTheDocument();
  });

  it('disables tier sort when no rank is set', async () => {
    // afterEach 已把 rank 重置为 null
    renderTab();
    expect(await screen.findByRole('button', { name: '冲稳保' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /位次/ })).toBeEnabled();
  });

  it('does not show a rank-tier badge when no student rank is set', async () => {
    // afterEach 已把 rank 重置为 null，此用例不 setState rank
    mockedService.getList.mockResolvedValue({
      data: [{
        id: 7, name: '测试大学', code: null, province: '四川', city: '成都',
        type: '综合', level: '本科', runningNature: '公办',
        is985: true, is211: true, isDoubleFirstClass: true, ranking: null, logoUrl: null,
        latestAdmission: { minScore: 640, minRank: 11800 },
        predictedMinRank: 11000,
      }],
      pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    });
    renderTab();
    await screen.findByText('测试大学');
    expect(screen.queryByText('稳')).not.toBeInTheDocument();
  });

  it('shows soft ranking and category rank on the card', async () => {
    mockedService.getList.mockResolvedValue({
      data: [{
        id: 9, name: '某财经大学', code: null, province: '上海', city: '上海',
        type: '财经', level: '本科', runningNature: '公办',
        is985: false, is211: true, isDoubleFirstClass: true, ranking: null, logoUrl: null,
        latestAdmission: null, predictedMinRank: null,
        softRanking: 66, softRankList: '本科', softRankYear: 2026,
        softCategory: '财经类', softCategoryRank: 5,
      }],
      pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    });
    renderTab();
    expect(await screen.findByText(/软科2026/)).toBeInTheDocument();
    expect(screen.getByText(/财经类 #5/)).toBeInTheDocument();
  });

  it('renders only one location chip for 直辖市 (province === city)', async () => {
    mockedService.getList.mockResolvedValue({
      data: [{
        id: 10, name: '上海某大学', code: null, province: '上海', city: '上海',
        type: '综合', level: '本科', runningNature: '公办',
        is985: false, is211: false, isDoubleFirstClass: false, ranking: null, logoUrl: null,
        latestAdmission: null, predictedMinRank: null,
        softRanking: null, softRankList: null, softCategory: null,
        softCategoryRank: null, softRankYear: null,
      }],
      pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    });
    renderTab();
    await screen.findByText('上海某大学');
    // 直辖市：province === city；info chip 区域应只渲染一个 '上海'（消除 React 重复 key 警告）
    expect(screen.getAllByText('上海')).toHaveLength(1);
  });
});
